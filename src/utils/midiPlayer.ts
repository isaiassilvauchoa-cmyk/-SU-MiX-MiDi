import { MidiFile, MidiEvent, GENERAL_MIDI_INSTRUMENTS } from "./midiHelper";

/**
 * Sintetizador Polifônico e Sequenciador de MIDI no navegador usando a Web Audio API.
 * Emprega um escalonador Look-Ahead para permitir alterações de Volume, Pan e Mute em tempo real.
 */

export class MidiSynthEngine {
  public ctx: AudioContext | null = null;
  private activeNodes: Map<string, { oscs: OscillatorNode[]; gain: GainNode; panNode: StereoPannerNode }> = new Map();
  private masterGain: GainNode | null = null;

  constructor() {
    // Inicializado de forma preguiçosa (lazy) ao primeiro toque/interação do usuário.
  }

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.8, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === "suspended") {
      this.ctx.resume();
    }
  }

  /**
   * Toca uma nota MIDI com um instrumento específico
   */
  public noteOn(note: number, velocity: number, instrument: number, pan: number = 64, trackVolume: number = 100): void {
    this.initCtx();
    if (!this.ctx || !this.masterGain) return;

    const channelVolume = (trackVolume / 127) * (velocity / 127);
    if (channelVolume <= 0) return;

    const freq = 440 * Math.pow(2, (note - 69) / 12);
    if (isNaN(freq) || freq < 10 || freq > 20000) return;

    const time = this.ctx.currentTime;
    const key = `${note}_${instrument}`;

    // Parar se já estiver ativa para evitar sobreposição descontrolada
    this.noteOff(note, instrument);

    const oscs: OscillatorNode[] = [];
    const gainNode = this.ctx.createGain();
    gainNode.gain.setValueAtTime(0.0001, time);

    // Ajuste de Pan Estéreo (MIDI Pan: 0 = esquerda, 64 = centro, 127 = direita)
    const panNormalized = ((pan - 64) / 64); // -1 a 1
    const panNode = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null as any;

    if (panNode) {
      panNode.pan.setValueAtTime(panNormalized, time);
      gainNode.connect(panNode);
      panNode.connect(this.masterGain);
    } else {
      gainNode.connect(this.masterGain);
    }

    // Configuração do timbre do instrumento (Diferentes timbres baseados no patch General MIDI)
    if (instrument <= 7) {
      // pianos (Rhodes / Cauda) - decaimento rápido, harmônicos suaves
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(freq, time);

      osc2.type = "triangle";
      osc2.frequency.setValueAtTime(freq * 2, time);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      oscs.push(osc1, osc2);

      // Envelope ADSR
      gainNode.gain.linearRampToValueAtTime(channelVolume * 0.7, time + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(channelVolume * 0.15, time + 0.4);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 1.8);
      
      osc1.start(time);
      osc2.start(time);
      osc1.stop(time + 1.9);
      osc2.stop(time + 1.9);

    } else if (instrument >= 16 && instrument <= 23) {
      // Orgaos - sustentação infinita, harmônicos mistos
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();
      const osc3 = this.ctx.createOscillator();

      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(freq, time);

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq * 2, time);

      osc3.type = "sine";
      osc3.frequency.setValueAtTime(freq * 0.5, time); // sub

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      osc3.connect(gainNode);
      oscs.push(osc1, osc2, osc3);

      gainNode.gain.linearRampToValueAtTime(channelVolume * 0.5, time + 0.05);

      osc1.start(time);
      osc2.start(time);
      osc3.start(time);

    } else if (instrument >= 24 && instrument <= 31) {
      // Violão / Guitarras - rápido decaimento plucky
      const osc1 = this.ctx.createOscillator();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(freq, time);
      osc1.connect(gainNode);
      oscs.push(osc1);

      gainNode.gain.linearRampToValueAtTime(channelVolume * 0.8, time + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(channelVolume * 0.1, time + 0.35);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 1.2);

      osc1.start(time);
      osc1.stop(time + 1.3);

    } else if (instrument >= 40 && instrument <= 51) {
      // Cordas (Violino / Violoncelo) - ataque suave, vibrato
      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(freq, time);
      
      // Vibrato suave usando um LFO
      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(5.5, time); // 5.5 Hz vibrato
      lfoGain.gain.setValueAtTime(freq * 0.012, time); // variação de tom de 1.2%
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfo.start(time);
      
      // Filtro Lowpass para suavizar
      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(freq * 2.5, time);

      osc1.connect(filter);
      filter.connect(gainNode);
      oscs.push(osc1, lfo as any);

      gainNode.gain.linearRampToValueAtTime(channelVolume * 0.6, time + 0.18); // ataque longo

      osc1.start(time);

    } else if (instrument >= 56 && instrument <= 63) {
      // Metais (Trumpet / Sopro) - ataque rápido e dente de serra ressonante
      const osc1 = this.ctx.createOscillator();
      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(freq, time);

      const filter = this.ctx.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.setValueAtTime(freq * 1.5, time);
      filter.Q.setValueAtTime(5, time);
      filter.frequency.exponentialRampToValueAtTime(freq * 4, time + 0.08);

      osc1.connect(filter);
      filter.connect(gainNode);
      oscs.push(osc1);

      gainNode.gain.linearRampToValueAtTime(channelVolume * 0.6, time + 0.04);
      gainNode.gain.exponentialRampToValueAtTime(channelVolume * 0.4, time + 0.3);

      osc1.start(time);

    } else if (instrument >= 72 && instrument <= 79) {
      // Sopros de madeira (Flauta / Recorders) - onda senoidal pura + vibrato
      const osc1 = this.ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.setValueAtTime(freq, time);

      const lfo = this.ctx.createOscillator();
      const lfoGain = this.ctx.createGain();
      lfo.frequency.setValueAtTime(6.0, time);
      lfoGain.gain.setValueAtTime(freq * 0.008, time);
      lfo.connect(lfoGain);
      lfoGain.connect(osc1.frequency);
      lfo.start(time);

      osc1.connect(gainNode);
      oscs.push(osc1, lfo as any);

      gainNode.gain.linearRampToValueAtTime(channelVolume * 0.65, time + 0.08);

      osc1.start(time);

    } else if (instrument >= 80 && instrument <= 87) {
      // Lead Sintetizado - Dente de serra duplo e detetunado (Fat Synth Lead)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();

      osc1.type = "sawtooth";
      osc1.frequency.setValueAtTime(freq - 2, time);

      osc2.type = "sawtooth";
      osc2.frequency.setValueAtTime(freq + 2, time);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      oscs.push(osc1, osc2);

      gainNode.gain.linearRampToValueAtTime(channelVolume * 0.5, time + 0.015);

      osc1.start(time);
      osc2.start(time);

    } else if (instrument >= 32 && instrument <= 39) {
      // Baixos Melódicos - Baixo encorpado (senóide + dente de serra filtrado)
      const osc1 = this.ctx.createOscillator();
      const osc2 = this.ctx.createOscillator();

      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(freq, time);

      osc2.type = "sine";
      osc2.frequency.setValueAtTime(freq, time);

      osc1.connect(gainNode);
      osc2.connect(gainNode);
      oscs.push(osc1, osc2);

      gainNode.gain.linearRampToValueAtTime(channelVolume * 0.8, time + 0.01);
      gainNode.gain.exponentialRampToValueAtTime(channelVolume * 0.3, time + 0.4);

      osc1.start(time);
      osc2.start(time);

    } else {
      // Qualquer outro patch - Sintetizador padrão versátil
      const osc1 = this.ctx.createOscillator();
      osc1.type = "triangle";
      osc1.frequency.setValueAtTime(freq, time);
      osc1.connect(gainNode);
      oscs.push(osc1);

      gainNode.gain.linearRampToValueAtTime(channelVolume * 0.7, time + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, time + 1.5);

      osc1.start(time);
      osc1.stop(time + 1.6);
    }

    this.activeNodes.set(key, { oscs, gain: gainNode, panNode });
  }

  /**
   * Finaliza uma nota MIDI ativa suavemente
   */
  public noteOff(note: number, instrument: number): void {
    const key = `${note}_${instrument}`;
    const active = this.activeNodes.get(key);
    if (!active) return;

    this.activeNodes.delete(key);
    const { oscs, gain } = active;

    if (!this.ctx) return;
    const time = this.ctx.currentTime;

    try {
      // Release suave de 120ms para silenciar sem estalos
      gain.gain.cancelScheduledValues(time);
      gain.gain.setValueAtTime(gain.gain.value, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.12);

      // Desliga todos os osciladores desta nota
      oscs.forEach(osc => {
        try {
          osc.stop(time + 0.14);
        } catch {
          // Já parou antes
        }
      });
    } catch {
      // Segurança contra conexões inválidas
    }
  }

  /**
   * Silencia todas as vozes tocando atualmente
   */
  public panic(): void {
    const time = this.ctx ? this.ctx.currentTime : 0;
    this.activeNodes.forEach(active => {
      active.gain.disconnect();
      active.oscs.forEach(osc => {
        try {
          osc.stop(time);
        } catch {}
      });
    });
    this.activeNodes.clear();
  }
}

/**
 * Sequenciador de reprodução de arquivos MIDI integrador com o Sintetizador
 */
export class MidiFilePlayer {
  private midi: MidiFile | null = null;
  private synth: MidiSynthEngine;
  private playTimer: any = null;
  
  // Variáveis de Estado de Playback
  private isPlaying: boolean = false;
  private currentTicks: number = 0;
  private bpm: number = 120;
  private onProgressCallback: ((ticks: number, percentage: number) => void) | null = null;
  private onFinishedCallback: (() => void) | null = null;

  // Estado dinâmico das trilhas (alterável a qualquer hora durante o play)
  private trackVolumeMap: Map<number, number> = new Map(); // trackIdx -> volume
  private trackPanMap: Map<number, number> = new Map(); // trackIdx -> pan
  private trackInstrumentMap: Map<number, number> = new Map(); // trackIdx -> instrument (programChange)
  private mutedTracks: Set<number> = new Set();
  private soloTracks: Set<number> = new Set();

  constructor(synth: MidiSynthEngine) {
    this.synth = synth;
  }

  public loadFile(midi: MidiFile): void {
    this.stop();
    this.midi = midi;
    this.currentTicks = 0;
    
    // Inicializa mapas com valores padrão do próprio MIDI
    this.trackVolumeMap.clear();
    this.trackPanMap.clear();
    this.trackInstrumentMap.clear();
    this.mutedTracks.clear();
    this.soloTracks.clear();

    midi.tracks.forEach((track, idx) => {
      this.trackVolumeMap.set(idx, 100);
      this.trackPanMap.set(idx, 64);
      this.trackInstrumentMap.set(idx, 0); // Piano acústico inicial

      // Analisa e preenche dados iniciais
      track.events.forEach(ev => {
        if (ev.type === "programChange" && ev.param1 !== undefined) {
          this.trackInstrumentMap.set(idx, ev.param1);
        }
        if (ev.type === "controller" && ev.param1 === 7 && ev.param2 !== undefined) {
          this.trackVolumeMap.set(idx, ev.param2);
        }
        if (ev.type === "controller" && ev.param1 === 10 && ev.param2 !== undefined) {
          this.trackPanMap.set(idx, ev.param2);
        }
      });
    });
  }

  public setTrackVolume(trackIdx: number, volume: number): void {
    this.trackVolumeMap.set(trackIdx, volume);
  }

  public setTrackPan(trackIdx: number, pan: number): void {
    this.trackPanMap.set(trackIdx, pan);
  }

  public setTrackInstrument(trackIdx: number, patch: number): void {
    this.trackInstrumentMap.set(trackIdx, patch);
  }

  public toggleMute(trackIdx: number): void {
    if (this.mutedTracks.has(trackIdx)) {
      this.mutedTracks.delete(trackIdx);
    } else {
      this.mutedTracks.add(trackIdx);
    }
  }

  public toggleSolo(trackIdx: number): void {
    if (this.soloTracks.has(trackIdx)) {
      this.soloTracks.delete(trackIdx);
    } else {
      this.soloTracks.add(trackIdx);
    }
  }

  public setBpm(bpm: number): void {
    this.bpm = bpm;
  }

  public getBpm(): number {
    return this.bpm;
  }

  public onProgress(callback: (ticks: number, percentage: number) => void): void {
    this.onProgressCallback = callback;
  }

  public onFinished(callback: () => void): void {
    this.onFinishedCallback = callback;
  }

  public play(): void {
    if (!this.midi || this.isPlaying) return;
    this.isPlaying = true;

    // Procura por algum evento de andamento em ticks iniciais para recalcular o BPM
    this.midi.tracks.forEach(track => {
      track.events.forEach(ev => {
        if (ev.type === "meta" && ev.metaType === 0x51 && ev.metaData) {
          // Tempo meta: 3 bytes representando microssegundos por semínima
          const val = (ev.metaData[0] << 16) | (ev.metaData[1] << 8) | ev.metaData[2];
          const estimatedBpm = Math.round(60000000 / val);
          if (estimatedBpm > 20 && estimatedBpm < 300) {
            this.bpm = estimatedBpm;
          }
        }
      });
    });

    // Eventos ordenados cronologicamente em tempo absoluto de ticks por trilha
    interface FlatEvent {
      ticks: number;
      trackIdx: number;
      event: MidiEvent;
    }

    const flatEvents: FlatEvent[] = [];
    this.midi.tracks.forEach((track, trackIdx) => {
      let accumTicks = 0;
      track.events.forEach(ev => {
        accumTicks += ev.deltaTime;
        flatEvents.push({
          ticks: accumTicks,
          trackIdx,
          event: ev
        });
      });
    });

    // Ordena todos por ticks absoluto
    flatEvents.sort((a, b) => a.ticks - b.ticks);

    const totalTicks = flatEvents.length > 0 ? flatEvents[flatEvents.length - 1].ticks : 1;

    // Armazena ponteiro atual dos eventos
    let eventCursor = 0;
    while (eventCursor < flatEvents.length && flatEvents[eventCursor].ticks < this.currentTicks) {
      eventCursor++;
    }

    let lastTime = Date.now();

    // Loop de agendamento preciso
    const tickInterval = 25; // 25ms de loop
    this.playTimer = setInterval(() => {
      if (!this.isPlaying || !this.midi) {
        clearInterval(this.playTimer);
        return;
      }

      const now = Date.now();
      const elapsedMs = now - lastTime;
      lastTime = now;

      // Converte tempo real em ticks baseados no BPM e divisão
      const ticksPerSecond = this.midi.division * (this.bpm / 60);
      const deltaTicks = (elapsedMs / 1000) * ticksPerSecond;
      this.currentTicks += deltaTicks;

      // Executa todos os eventos até currentTicks
      while (eventCursor < flatEvents.length && flatEvents[eventCursor].ticks <= this.currentTicks) {
        const item = flatEvents[eventCursor];
        eventCursor++;

        const trackIdx = item.trackIdx;
        const ev = item.event;

        // Verifica filtros de Solo e Mute
        const isSomeTrackSolo = this.soloTracks.size > 0;
        const isMuted = this.mutedTracks.has(trackIdx);
        const isSolo = this.soloTracks.has(trackIdx);
        
        let playAllowed = true;
        if (isSomeTrackSolo) {
          playAllowed = isSolo;
        } else {
          playAllowed = !isMuted;
        }

        if (playAllowed) {
          const trackVol = this.trackVolumeMap.get(trackIdx) ?? 100;
          const trackPan = this.trackPanMap.get(trackIdx) ?? 64;
          const trackInst = this.trackInstrumentMap.get(trackIdx) ?? 0;

          if (ev.type === "noteOn" && ev.param1 !== undefined && ev.param2 !== undefined) {
            this.synth.noteOn(ev.param1, ev.param2, trackInst, trackPan, trackVol);
          } else if (ev.type === "noteOff" && ev.param1 !== undefined) {
            this.synth.noteOff(ev.param1, trackInst);
          }
        }
      }

      // Notifica progresso
      if (this.onProgressCallback) {
        let percent = this.currentTicks / totalTicks;
        if (percent > 1.0) percent = 1.0;
        this.onProgressCallback(Math.round(this.currentTicks), percent);
      }

      // Fim da partitura
      if (eventCursor >= flatEvents.length && this.currentTicks >= totalTicks) {
        this.stop();
        if (this.onFinishedCallback) {
          this.onFinishedCallback();
        }
      }
    }, tickInterval);
  }

  public pause(): void {
    this.isPlaying = false;
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
    this.synth.panic();
  }

  public stop(): void {
    this.isPlaying = false;
    if (this.playTimer) {
      clearInterval(this.playTimer);
      this.playTimer = null;
    }
    this.currentTicks = 0;
    this.synth.panic();
    if (this.onProgressCallback) {
      this.onProgressCallback(0, 0);
    }
  }

  public seek(percentage: number): void {
    if (!this.midi) return;
    
    // Calcula ticks totais do MIDI
    let maxTicks = 1;
    this.midi.tracks.forEach(t => {
      let ticks = 0;
      t.events.forEach(ev => { ticks += ev.deltaTime; });
      if (ticks > maxTicks) maxTicks = ticks;
    });

    const wasPlaying = this.isPlaying;
    this.pause();
    this.currentTicks = maxTicks * percentage;
    if (wasPlaying) {
      this.play();
    } else if (this.onProgressCallback) {
      this.onProgressCallback(Math.round(this.currentTicks), percentage);
    }
  }

  public getIsPlaying(): boolean {
    return this.isPlaying;
  }

  public getCurrentTicks(): number {
    return this.currentTicks;
  }
}

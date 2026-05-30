/**
 * Helper para leitura, modificação e escrita de arquivos MIDI (SMF - Standard MIDI File)
 * Implementado de forma nativa e autônoma em TypeScript.
 */

export interface MidiEvent {
  deltaTime: number; // ticks desde o evento anterior
  type: string;      // 'noteOn' | 'noteOff' | 'controller' | 'programChange' | 'meta' | 'other'
  status: number;    // byte de status completo
  channel?: number;  // canal MIDI (0-15)
  param1?: number;   // nota, número de controle ou tipo meta
  param2?: number;   // velocity ou valor do controle
  metaType?: number; // sub-tipo do evento meta
  metaData?: Uint8Array; // dados binários do evento meta
  originalBytes?: Uint8Array;
}

export interface MidiTrack {
  name: string;
  events: MidiEvent[];
}

export interface MidiFile {
  format: number;     // 0 ou 1
  division: number;   // ticks por semínima (ticks per quarter note)
  tracks: MidiTrack[];
}

export interface TrackControl {
  trackIndex: number;
  volume: number;      // 0 a 127
  pan: number;         // 0 a 127
  instrument: number;  // 0 a 127 (Patch MIDI)
  muted: boolean;
  solo: boolean;
}

// Lista de instrumentos padrão do General MIDI (GM1) em português
export const GENERAL_MIDI_INSTRUMENTS = [
  // Pianos
  "Piano de Cauda Acústico", "Piano Acústico Suave", "Piano Elétrico de Cauda", "Piano de Taverna",
  "Piano Elétrico 1 (Rhodes)", "Piano Elétrico 2 (Chorused)", "Cravina", "Clavinete",
  // Percussão Cromática
  "Celesta", "Glockenspiel", "Caixa de Música", "Vibrone", "Marimba", "Xilofone", "Sinos Tubulares", "Dulcimer",
  // Órgãos
  "Órgão de Gaveta", "Órgão Percussivo", "Órgão de Rock", "Órgão de Igreja", "Órgão de Palheta", "Acordeão", "Harmônica", "Bandoneon",
  // Guitarras/Violões
  "Violão (Nylon)", "Violão (Aço)", "Guitarra de Jazz", "Guitarra Elétrica (Limpa)", "Guitarra Elétrica (Muda)", "Guitarra Overdrive", "Guitarra Distorcida", "Harmônicos de Guitarra",
  // Baixos
  "Baixo Acústico", "Baixo Elétrico (Dedo)", "Baixo Elétrico (Palheta)", "Baixo Fretless", "Baixo Slap 1", "Baixo Slap 2", "Baixo Sintetizado 1", "Baixo Sintetizado 2",
  // Cordas
  "Violino", "Viola", "Violoncelo", "Contrabaixo", "Cordas Trêmulas", "Cordas Pizzicato", "Harpa Orquestral", "Tímpano",
  // Orquestra / Ensembles
  "Cordas Orquestrais 1", "Cordas Orquestrais 2", "Cordas Sintéticas 1", "Cordas Sintéticas 2", "Coro de Vozes 'Aah'", "Vozes 'Ooh'", "Voz Sintetizada", "Orquestra Hit",
  // Metais (Brass)
  "Trompete", "Trombone", "Tuba", "Trompete com Surdina", "Trompa", "Metais de Sopro", "Metais Sintetizados 1", "Metais Sintetizados 2",
  // Sopros de Palheta (Reed)
  "Sax SOPRANO", "Sax Alto", "Sax Tenor", "Sax Barítono", "Oboé", "Corne Inglês", "Fagote", "Clarinete",
  // Sopros de Tubo (Pipe)
  "Piccolo", "Flauta", "Flauta Doce", "Flauta de Pã", "Sopro de Garrafa", "Shakuhachi", "Apito", "Ocarina",
  // Sintetizador Lead
  "Sintetizador Quadrado (Square)", "Sintetizador Dente de Serra (Sawtooth)", "Calíope Sintetizado", "Sopro Sintetizado", "Sintetizador de Voz", "Sintetizador de Quinta", "Baixo Sintetizado Lead",
  // Sintetizador Pad
  "Pad de Fantasia", "Pad de Calor", "Pad de Polissintetizador", "Pad de Espaço", "Pad de Vidro", "Pad Metálico", "Pad de Halo", "Pad Varredura (Sweep)",
  // Sintetizador FX
  "FX Chuva", "FX Trilha Sonora", "FX Cristal", "FX Atmosfera", "FX Brilho", "FX Duendes", "FX Ecos", "FX Brisa Star",
  // Étnicos
  "Sitar", "Banjo", "Shamisen", "Koto", "Kalimba", "Gaita de Foles", "Fiddle", "Shanai",
  // Percussivos
  "Tinkle Bell", "Agogô", "Tambor de Aço", "Bloco de Madeira", "Taiko", "Tambor Melódico", "Sintetizador de Bumbo", "Prato de Dedos",
  // Efeitos Sonoros (SFX)
  "Ruído de Trastes", "Ruído de Sopro", "Ondas do Mar", "Canto de Pássaros", "Toque de Telefone", "Helicóptero", "Aplauso", "Tiro de Arma"
];

// Funções utilitárias para ler e escrever números de forma binária
function readUint32(data: Uint8Array, offset: number): number {
  return (data[offset] << 24) | (data[offset + 1] << 16) | (data[offset + 2] << 8) | data[offset + 3];
}

function readUint16(data: Uint8Array, offset: number): number {
  return (data[offset] << 8) | data[offset + 1];
}

function writeUint32(arr: number[], value: number): void {
  arr.push((value >> 24) & 0xFF, (value >> 16) & 0xFF, (value >> 8) & 0xFF, value & 0xFF);
}

function writeUint16(arr: number[], value: number): void {
  arr.push((value >> 8) & 0xFF, value & 0xFF);
}

// Lê uma quantidade de comprimento variável (Variable-Length Quantity - VLQ) MIDI
function readVarLength(data: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let bytesRead = 0;
  while (true) {
    const byte = data[offset + bytesRead];
    bytesRead++;
    value = (value << 7) | (byte & 0x7F);
    if ((byte & 0x80) === 0) {
      break;
    }
    if (bytesRead >= 4) break; // limite de segurança MIDI
  }
  return { value, bytesRead };
}

// Escreve uma quantidade de comprimento variável (VLQ)
function writeVarLength(value: number): number[] {
  const bytes: number[] = [];
  let buffer = value;
  bytes.push(buffer & 0x7F);
  while (buffer >> 7 > 0) {
    buffer = buffer >> 7;
    bytes.push((buffer & 0x7F) | 0x80);
  }
  return bytes.reverse();
}

/**
 * Decodifica um arquivo MIDI a partir de um array de bytes
 */
export function parseMidi(data: Uint8Array): MidiFile {
  let offset = 0;

  // 1. Procura pela assinatura Cabeçalho 'MThd' para máxima robustez
  let headerIndex = -1;
  for (let i = 0; i < Math.min(data.length - 4, 4096); i++) {
    if (data[i] === 0x4D && data[i+1] === 0x54 && data[i+2] === 0x68 && data[i+3] === 0x64) {
      headerIndex = i;
      break;
    }
  }

  if (headerIndex === -1) {
    throw new Error("Formato inválido: Assinatura 'MThd' não encontrada no fluxo de bytes do arquivo MIDI.");
  }

  offset = headerIndex;

  const headerLength = readUint32(data, offset + 4);
  const format = readUint16(data, offset + 8);
  const trackCount = readUint16(data, offset + 10);
  const division = readUint16(data, offset + 12);

  offset += 8 + headerLength; // avança o cabeçalho de forma segura

  const tracks: MidiTrack[] = [];

  // 2. Lê Tracks 'MTrk'
  for (let t = 0; t < trackCount; t++) {
    if (offset >= data.length) break;

    const trackSign = String.fromCharCode(data[offset], data[offset + 1], data[offset + 2], data[offset + 3]);
    if (trackSign !== "MTrk") {
      // Pula se houver chunk desconhecido
      const chunkLength = readUint32(data, offset + 4);
      offset += 8 + chunkLength;
      continue;
    }

    const trackLength = readUint32(data, offset + 4);
    const startOfTrackData = offset + 8;
    const endOfTrackData = startOfTrackData + trackLength;
    let trackOffset = startOfTrackData;

    const events: MidiEvent[] = [];
    let trackName = `Trilha ${t + 1}`;
    let runningStatus = 0;

    while (trackOffset < endOfTrackData && trackOffset < data.length) {
      try {
        const deltaRead = readVarLength(data, trackOffset);
        const deltaTime = deltaRead.value;
        trackOffset += deltaRead.bytesRead;

        if (trackOffset >= data.length) break;

        let statusByte = data[trackOffset];

        // Status Running (Status omitido, usa o anterior se for canal)
        if ((statusByte & 0x80) === 0) {
          if (runningStatus === 0) {
            // Em vez de crashar a decodificação inteira, vamos assumir o status padrão NoteOn no canal 0
            statusByte = 0x90;
          } else {
            statusByte = runningStatus;
          }
        } else {
          trackOffset++; // consome o byte de status
          if (statusByte < 0xF0) {
            runningStatus = statusByte;
          } else {
            // Meta eventos (0xFF) e SysEx (0xF0, 0xF7) cancelam o running status
            runningStatus = 0;
          }
        }

        const highNibble = statusByte & 0xF0;
        const channel = statusByte & 0x0F;

        let event: MidiEvent;

        if (statusByte === 0xFF) {
          // Evento Meta
          if (trackOffset >= data.length) break;
          const metaType = data[trackOffset];
          trackOffset++;
          const lengthRead = readVarLength(data, trackOffset);
          trackOffset += lengthRead.bytesRead;

          const metaLen = lengthRead.value;
          const metaData = data.slice(trackOffset, Math.min(trackOffset + metaLen, data.length));
          trackOffset += metaLen;

          let type = "meta";
          if (metaType === 0x03) {
            // Track Name
            try {
              trackName = new TextDecoder("utf-8").decode(metaData).replace(/\0/g, "");
            } catch {
              trackName = Array.from(metaData).map(b => String.fromCharCode(b)).join("");
            }
          } else if (metaType === 0x2F) {
            type = "endOfTrack";
          }

          event = {
            deltaTime,
            type,
            status: statusByte,
            metaType,
            metaData
          };
        } else if (statusByte === 0xF0 || statusByte === 0xF7) {
          // Evento SysEx
          const lengthRead = readVarLength(data, trackOffset);
          trackOffset += lengthRead.bytesRead;
          const sysExLen = lengthRead.value;
          const sysExData = data.slice(trackOffset, Math.min(trackOffset + sysExLen, data.length));
          trackOffset += sysExLen;

          event = {
            deltaTime,
            type: "sysEx",
            status: statusByte,
            metaData: sysExData
          };
        } else {
          // Eventos de Canal MIDI normais com limites seguros
          let param1 = 0;
          let param2 = 0;

          if (trackOffset < data.length) {
            switch (highNibble) {
              case 0x80: // Note Off
              case 0x90: // Note On
              case 0xA0: // Key Pressure
              case 0xB0: // Control Change
              case 0xE0: // Pitch Bend
                param1 = data[trackOffset] ?? 0;
                param2 = data[trackOffset + 1] ?? 0;
                trackOffset += 2;
                break;
              case 0xC0: // Program Change
              case 0xD0: // Channel Pressure
                param1 = data[trackOffset] ?? 0;
                trackOffset += 1;
                break;
              default:
                // Se for status desconhecido, pula 1 byte para não travar
                trackOffset += 1;
                break;
            }
          }

          let type = "other";
          if (highNibble === 0x80) type = "noteOff";
          else if (highNibble === 0x90) type = (param2 === 0) ? "noteOff" : "noteOn";
          else if (highNibble === 0xB0) type = "controller";
          else if (highNibble === 0xC0) type = "programChange";

          event = {
            deltaTime,
            type,
            status: statusByte,
            channel,
            param1,
            param2
          };
        }

        events.push(event);
        if (event.type === "endOfTrack") {
          break;
        }
      } catch (errEvent) {
        console.warn("Pulando evento corrompido no parser MIDI:", errEvent);
        // Avança pelo menos 1 byte sob erro de parse de evento para evitar loop infinito
        trackOffset++;
      }
    }

    tracks.push({
      name: trackName,
      events
    });

    offset = endOfTrackData;
  }

  return {
    format,
    division,
    tracks
  };
}

/**
 * Codifica uma estrutura MidiFile em formato binário (.mid)
 */
export function writeMidi(midi: MidiFile): Uint8Array {
  const bytes: number[] = [];

  // MThd
  bytes.push(...[0x4D, 0x54, 0x68, 0x64]); // "MThd"
  writeUint32(bytes, 6); // tamanho do cabeçalho sempre 6
  writeUint16(bytes, midi.format);
  writeUint16(bytes, midi.tracks.length);
  writeUint16(bytes, midi.division);

  // MTrk para cada trilha
  for (const track of midi.tracks) {
    const trackEventBytes: number[] = [];

    // Se a trilha tem um nome, injeta o evento meta de nome se já não estiver no início
    let hasNameMeta = false;
    for (const ev of track.events.slice(0, 5)) {
      if (ev.status === 0xFF && ev.metaType === 0x03) {
        hasNameMeta = true;
        break;
      }
    }

    if (!hasNameMeta && track.name) {
      // Injeta nome da trilha
      trackEventBytes.push(0); // deltaTime = 0
      trackEventBytes.push(0xFF, 0x03); // Status FF, Meta tipo 3
      const nameBytes = new TextEncoder().encode(track.name);
      trackEventBytes.push(...writeVarLength(nameBytes.length));
      trackEventBytes.push(...Array.from(nameBytes));
    }

    // Processa os eventos da trilha
    let runningTrackDelta = 0;
    for (const ev of track.events) {
      trackEventBytes.push(...writeVarLength(ev.deltaTime));

      if (ev.status === 0xFF) {
        // Meta Event
        trackEventBytes.push(0xFF);
        trackEventBytes.push(ev.metaType ?? 0);
        if (ev.metaData) {
          trackEventBytes.push(...writeVarLength(ev.metaData.length));
          trackEventBytes.push(...Array.from(ev.metaData));
        } else {
          trackEventBytes.push(0); // comprimento 0
        }
      } else if (ev.status === 0xF0 || ev.status === 0xF7) {
        // SysEx
        trackEventBytes.push(ev.status);
        if (ev.metaData) {
          trackEventBytes.push(...writeVarLength(ev.metaData.length));
          trackEventBytes.push(...Array.from(ev.metaData));
        } else {
          trackEventBytes.push(0);
        }
      } else {
        // Eventos padrões
        trackEventBytes.push(ev.status);
        const highNibble = ev.status & 0xF0;
        if (highNibble === 0xC0 || highNibble === 0xD0) {
          trackEventBytes.push(ev.param1 ?? 0);
        } else {
          trackEventBytes.push(ev.param1 ?? 0);
          trackEventBytes.push(ev.param2 ?? 0);
        }
      }
    }

    // Insere final de trilha se não houver
    const lastEvent = track.events[track.events.length - 1];
    if (!lastEvent || lastEvent.status !== 0xFF || lastEvent.metaType !== 0x2F) {
      trackEventBytes.push(0); // deltaTime
      trackEventBytes.push(0xFF, 0x2F, 0x00); // end of track meta event
    }

    // MTrk cabecalho
    bytes.push(...[0x4D, 0x54, 0x72, 0x6B]); // "MTrk"
    writeUint32(bytes, trackEventBytes.length);
    bytes.push(...trackEventBytes);
  }

  return new Uint8Array(bytes);
}

/**
 * Junta vários arquivos MIDI em um único
 * @param midis Lista de arquivos MIDI decodificados
 * @param mode 'sync' (toca simultaneamente como trilhas separadas) ou 'sequence' (toca sequencialmente)
 */
export function mergeMidis(midis: MidiFile[], mode: 'sync' | 'sequence'): MidiFile {
  if (midis.length === 0) {
    throw new Error("Nenhum arquivo MIDI fornecido para mesclagem.");
  }
  if (midis.length === 1) {
    return midis[0];
  }

  // Usa o division do primeiro midi como padrão
  const division = midis[0].division;
  const tracks: MidiTrack[] = [];

  if (mode === 'sync') {
    // Modo Sincronizado (Paralelo): Cada track de todos os arquivos é mantida como trilha separada.
    // Todas começam no delta de tempo inicial zero.
    midis.forEach((m, fileIdx) => {
      // Ajusta delta-times se as divisões do tempo diferirem
      const divisionScale = (m.division && m.division > 0) ? (division / m.division) : 1;

      m.tracks.forEach((t, trackIdx) => {
        let scaledEvents = t.events.map(ev => ({
          ...ev,
          deltaTime: Math.round(ev.deltaTime * divisionScale)
        }));

        tracks.push({
          name: `Arq ${fileIdx + 1} - ${t.name}`,
          events: scaledEvents
        });
      });
    });
  } else {
    // Modo Sequência (Série): Concatenar os arquivos um após o outro.
    // Para concatenar, precisamos prever a duração aproximada em ticks de cada arquivo MIDI
    // e adicionar esse atraso antes do primeiro evento da próxima sequência.
    
    // Mapeia canais diferentes para cada arquivo (se puder) ou une e enfileira
    // Criaremos trilhas consolidadas.
    // Uma forma simples e super robusta de fazer:
    // Nós colocamos todas as tracks juntas, mas na trilha j-ésima de m_i,
    // o primeiro evento terá o tempo de atraso correspondente ao tempo total acumulado.

    let cumulativeDelayTicks = 0;

    midis.forEach((m, fileIdx) => {
      const divisionScale = (m.division && m.division > 0) ? (division / m.division) : 1;

      // Calcula a duração máxima desta track para avançar o tempo absoluto
      let maxTrackTicks = 0;
      m.tracks.forEach(track => {
        let currentTicks = 0;
        track.events.forEach(ev => {
          currentTicks += Math.round(ev.deltaTime * divisionScale);
        });
        if (currentTicks > maxTrackTicks) {
          maxTrackTicks = currentTicks;
        }
      });

      m.tracks.forEach((track, trackIdx) => {
        // Encontra ou cria uma track conjunta de destino
        // Para manter as coisas separadas, podemos criar trilhas separadas e atrasá-las
        let scaledEvents = track.events.map((ev, evIdx) => {
          const scaledDelta = Math.round(ev.deltaTime * divisionScale);
          return {
            ...ev,
            // O primeiro evento do arquivo acumula o atraso de todos os arquivos anteriores
            deltaTime: evIdx === 0 ? cumulativeDelayTicks + scaledDelta : scaledDelta
          };
        });

        tracks.push({
          name: `Seq ${fileIdx + 1} - ${track.name}`,
          events: scaledEvents
        });
      });

      // Incrementa o tempo acumulado para o próximo arquivo.
      // Se a música for muito curta, adicionamos um atraso mínimo equivalente a uma pausa breve (ex: 4 pulsações = division * 4)
      cumulativeDelayTicks += maxTrackTicks > 0 ? maxTrackTicks : (division * 4);
    });
  }

  return {
    format: 1, // formato multi-pistas
    division,
    tracks
  };
}

/**
 * Modifica os canais por trilha no MidiFile para configurar Volume, Pan e Instrumento
 */
export function injectTrackControls(midi: MidiFile, trackControls: TrackControl[]): MidiFile {
  // Clona o MidiFile
  const newMidi: MidiFile = JSON.parse(JSON.stringify(midi));

  trackControls.forEach(ctrl => {
    if (ctrl.trackIndex < 0 || ctrl.trackIndex >= newMidi.tracks.length) return;

    const track = newMidi.tracks[ctrl.trackIndex];
    const events = track.events;

    // Remove qualquer volume (CC7), pan (CC10) e Program Change inicial existente (no delta-time zero)
    // para não conflitar com as novas configurações injetadas.
    let searchIdx = 0;
    while (searchIdx < events.length && events[searchIdx].deltaTime === 0) {
      const ev = events[searchIdx];
      const highNibble = ev.status & 0xF0;
      
      const isInitialVolume = ev.type === "controller" && ev.param1 === 7;
      const isInitialPan = ev.type === "controller" && ev.param1 === 10;
      const isInitialProgChange = ev.type === "programChange";

      if (isInitialVolume || isInitialPan || isInitialProgChange) {
        events.splice(searchIdx, 1);
      } else {
        searchIdx++;
      }
    }

    // Vamos encontrar o canal primário usado nessa trilha, analisando os eventos Note On/Off
    let primaryChannel = 0;
    for (const ev of events) {
      if (ev.channel !== undefined && (ev.type === "noteOn" || ev.type === "noteOff")) {
        primaryChannel = ev.channel;
        break;
      }
    }

    // Se o usuário silenciar totalmente ou usar solo para excluir outros, nós podemos aplicar volume zero
    const actualVolume = ctrl.muted ? 0 : ctrl.volume;

    // Cria os novos eventos de controle a serem inseridos no exato início da trilha (deltaTime = 0)
    const newControlEvents: MidiEvent[] = [];

    // 1. Program Change (Instrumento)
    const progStatus = 0xC0 | primaryChannel;
    newControlEvents.push({
      deltaTime: 0,
      type: "programChange",
      status: progStatus,
      channel: primaryChannel,
      param1: ctrl.instrument,
      param2: 0
    });

    // 2. Volume (CC 7)
    const ctrlStatus = 0xB0 | primaryChannel;
    newControlEvents.push({
      deltaTime: 0,
      type: "controller",
      status: ctrlStatus,
      channel: primaryChannel,
      param1: 7,
      param2: actualVolume
    });

    // 3. Pan (CC 10)
    newControlEvents.push({
      deltaTime: 0,
      type: "controller",
      status: ctrlStatus,
      channel: primaryChannel,
      param1: 10,
      param2: ctrl.pan
    });

    // Insere no início da track
    events.unshift(...newControlEvents);
  });

  // Se houver alguma trilha com SOLO ativado, silenciar todas as outras trilhas que não estão em solo!
  const hasSoloTrack = trackControls.some(ctrl => ctrl.solo);
  if (hasSoloTrack) {
    newMidi.tracks.forEach((track, idx) => {
      const ctrl = trackControls.find(c => c.trackIndex === idx);
      const isSolo = ctrl ? ctrl.solo : false;

      if (!isSolo) {
        // Encontra o canal primário e injeta Volume = 0 no início desta trilha
        let primaryChannel = 0;
        for (const ev of track.events) {
          if (ev.channel !== undefined && (ev.type === "noteOn" || ev.type === "noteOff")) {
            primaryChannel = ev.channel;
            break;
          }
        }

        // Procura se já inserimos volume e sobrescreve para 0, se não, unshift volume=0
        let volEventFound = false;
        for (const ev of track.events.slice(0, 10)) {
          if (ev.type === "controller" && ev.param1 === 7) {
            ev.param2 = 0;
            volEventFound = true;
            break;
          }
        }

        if (!volEventFound) {
          track.events.unshift({
            deltaTime: 0,
            type: "controller",
            status: 0xB0 | primaryChannel,
            channel: primaryChannel,
            param1: 7,
            param2: 0
          });
        }
      }
    });
  }

  return newMidi;
}

/**
 * Cria um arquivo MIDI padrão SMF (Format 0) a partir de uma lista arbitrária de notas
 */
export interface SimpleNote {
  note: number;      // 0-127 (padrão MIDI, Ex: 60 = C4)
  startTime: number; // segundos
  duration: number;  // segundos
  velocity: number;  // 1-127
}

export function createMidiFromNotes(notes: SimpleNote[], instrument: number = 0, division: number = 480, bpm: number = 120): MidiFile {
  const events: MidiEvent[] = [];
  
  // Ticks por segundo: division * (bpm / 60)
  const ticksPerSecond = division * (bpm / 60);

  // Mapeia notas simples em sequências absoluto-tempo de Note On e Note Off
  interface TempEvent {
    ticks: number;
    type: 'on' | 'off';
    note: number;
    velocity: number;
  }

  const tempEvents: TempEvent[] = [];
  notes.forEach(n => {
    const startTicks = Math.round(n.startTime * ticksPerSecond);
    const endTicks = Math.round((n.startTime + n.duration) * ticksPerSecond);

    tempEvents.push({
      ticks: startTicks,
      type: 'on',
      note: n.note,
      velocity: n.velocity
    });

    tempEvents.push({
      ticks: endTicks,
      type: 'off',
      note: n.note,
      velocity: n.velocity
    });
  });

  // Ordena eventos por ticks cronológicos. Se em mesmo tick, 'off' vem antes de 'on' para tocar bonito
  tempEvents.sort((a, b) => {
    if (a.ticks === b.ticks) {
      return a.type === 'off' ? -1 : 1;
    }
    return a.ticks - b.ticks;
  });

  // Insere Program Change padrão no início
  events.push({
    deltaTime: 0,
    type: "programChange",
    status: 0xC0, // pc canal 0
    channel: 0,
    param1: instrument,
    param2: 0
  });

  // Insere Volume padrão alto
  events.push({
    deltaTime: 0,
    type: "controller",
    status: 0xB0, // cc canal 0
    channel: 0,
    param1: 7,
    param2: 100
  });

  // Converte tempo absoluto para delta-times MIDI
  let prevTicks = 0;
  tempEvents.forEach(te => {
    const delta = te.ticks - prevTicks;
    prevTicks = te.ticks;

    if (te.type === 'on') {
      events.push({
        deltaTime: delta,
        type: "noteOn",
        status: 0x90, // can 0
        channel: 0,
        param1: te.note,
        param2: te.velocity
      });
    } else {
      events.push({
        deltaTime: delta,
        type: "noteOff",
        status: 0x80, // can 0
        channel: 0,
        param1: te.note,
        param2: 0
      });
    }
  });

  // Insere End Of Track
  events.push({
    deltaTime: 0,
    type: "endOfTrack",
    status: 0xFF,
    metaType: 0x2F
  });

  return {
    format: 0,
    division,
    tracks: [
      {
        name: "Conversão de Áudio",
        events
      }
    ]
  };
}

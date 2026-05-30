import { SimpleNote } from "./midiHelper";

/**
 * Utilitário de detecção de tom (Pitch Detection) para converter arquivos
 * de áudio contendo melodias monofônicas (como assobios, canto ou instrumentos solos)
 * em notas MIDI estruturadas.
 */

// Converte frequência hz para número de nota MIDI
export function frequencyToMidi(frequency: number): number {
  const noteNum = 12 * Math.log2(frequency / 440) + 69;
  return Math.round(noteNum);
}

// Converte número de nota MIDI para frequência em Hz
export function midiToFrequency(note: number): number {
  return 440 * Math.pow(2, (note - 69) / 12);
}

// Converte número de nota MIDI em nome amigável (C4, F#3, etc.)
export function midiToNoteName(note: number): string {
  const notes = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const name = notes[note % 12];
  const octave = Math.floor(note / 12) - 1;
  return `${name}${octave}`;
}

/**
 * Algoritmo de Autocorrelação de YIN / Clássica simplificada para detecção de pitch em tempo real/offline
 * Retorna a frequência fundamental (f0) ou -1 se for silêncio/ruído de fundo.
 */
function autoCorrelate(buffer: Float32Array, sampleRate: number, sensitivity: number = 0.5): number {
  // 1. Calcula a potência da onda para limiar de silêncio (RMS)
  let sumOfSquares = 0;
  for (let i = 0; i < buffer.length; i++) {
    sumOfSquares += buffer[i] * buffer[i];
  }
  const rms = Math.sqrt(sumOfSquares / buffer.length);
  if (rms < 0.01) {
    return -1; // Silêncio total
  }

  // 2. Limita a busca para frequências humanas razoáveis (60Hz a 1600Hz / Notas MIDI 32 a 100)
  const minFreq = 65; // C2 aprox.
  const maxFreq = 1500; // F#6 aprox.
  const maxLag = Math.floor(sampleRate / minFreq);
  const minLag = Math.floor(sampleRate / maxFreq);

  // Calcula autocorrelação para diferentes deslocamentos (lags)
  let bestLag = -1;
  let bestCorrelation = -1;
  const correlations = new Float32Array(maxLag + 1);

  for (let lag = minLag; lag <= maxLag; lag++) {
    let correlation = 0;
    let sumOfSquaresLag = 0;
    // Compara o sinal com ele mesmo deslocado de 'lag' unidades
    for (let i = 0; i < buffer.length - lag; i++) {
      correlation += buffer[i] * buffer[i + lag];
    }
    
    // Normaliza
    correlations[lag] = correlation / buffer.length;
  }

  // Encontra o pico principal que ultrapassa a sensibilidade
  // Usamos autocorrelação normalizada simples procurando pelo primeiro pico local significativo
  let peakValue = -1;
  let peakLag = -1;

  for (let lag = minLag + 1; lag < maxLag; lag++) {
    const prev = correlations[lag - 1];
    const curr = correlations[lag];
    const next = correlations[lag + 1];

    // Verifica se é um pico local
    if (curr > prev && curr > next) {
      if (curr > peakValue) {
        peakValue = curr;
        peakLag = lag;
      }
    }
  }

  // Força uma sensibilidade baseada no RMS e no pico encontrado
  const correlationFactor = peakValue / correlations[0]; // proporção em relação ao pico central
  
  if (correlationFactor > (1.1 - sensitivity) && peakLag > 0) {
    return sampleRate / peakLag;
  }

  return -1;
}

/**
 * Converte um buffer de áudio (decodificado de MP3/WAV) em uma série de notas MIDI simples
 * @param audioBuffer O buffer de áudio obtido do OfflineAudioContext
 * @param sensitivity Sensibilidade da detecção de pitch (0.1 a 0.9)
 * @param minNoteDuration Duração mínima de nota válida em segundos (padrão: 0.1s)
 */
export function transcribeAudio(
  audioBuffer: AudioBuffer,
  sensitivity: number = 0.6,
  minNoteDuration: number = 0.08
): SimpleNote[] {
  const sampleRate = audioBuffer.sampleRate;
  const data = audioBuffer.getChannelData(0); // usa o canal mono da esquerda
  const numSamples = data.length;

  // Janelas de análise de 2048 amostras (~46ms a 44.1kHz), com avanço constante
  const frameSize = 2048;
  const hopSize = 1024; // 50% de sobreposição (~23ms)
  const durationOfFrame = hopSize / sampleRate;

  interface RawFramePitch {
    time: number;
    note: number;
  }

  const rawPitches: RawFramePitch[] = [];

  // Analisa quadro por quadro
  for (let offset = 0; offset + frameSize < numSamples; offset += hopSize) {
    const frameBuffer = new Float32Array(frameSize);
    for (let i = 0; i < frameSize; i++) {
        frameBuffer[i] = data[offset + i];
    }

    const timeInSeconds = offset / sampleRate;
    const f0 = autoCorrelate(frameBuffer, sampleRate, sensitivity);

    if (f0 > 0) {
      const note = frequencyToMidi(f0);
      // Filtra pitches que fogem da extensão usual das notas musicais
      if (note >= 21 && note <= 108) { // Extensão de um piano completo (A0 a C8)
        rawPitches.push({
          time: timeInSeconds,
          note: note
        });
      }
    }
  }

  // Se nada foi detectado, retorna lista vazia
  if (rawPitches.length === 0) return [];

  // Agrupa os quadros sequenciais em notas MIDI consolidadas
  const notes: SimpleNote[] = [];
  let currentNote: { note: number; startTime: number; lastTime: number } | null = null;

  for (let i = 0; i < rawPitches.length; i++) {
    const frame = rawPitches[i];

    if (currentNote === null) {
      // Inicia nova nota
      currentNote = {
        note: frame.note,
        startTime: frame.time,
        lastTime: frame.time
      };
    } else {
      const timeDiff = frame.time - currentNote.lastTime;
      // Permite gaps discretos de até 3 quadros de atraso sem quebrar a nota
      const maxAllowedGap = durationOfFrame * 3.5;

      if (frame.note === currentNote.note && timeDiff <= maxAllowedGap) {
        // Continua a nota atual
        currentNote.lastTime = frame.time;
      } else {
        // Fecha a nota atual e salva se tiver duração mínima
        const dur = currentNote.lastTime - currentNote.startTime + durationOfFrame;
        if (dur >= minNoteDuration) {
          notes.push({
            note: currentNote.note,
            startTime: currentNote.startTime,
            duration: dur,
            velocity: 90 // velocity padrão confortável
          });
        }

        // Inicia a nova nota
        currentNote = {
          note: frame.note,
          startTime: frame.time,
          lastTime: frame.time
        };
      }
    }
  }

  // Salva a última nota restante se houver
  if (currentNote !== null) {
    const dur = (currentNote as any).lastTime - (currentNote as any).startTime + durationOfFrame;
    if (dur >= minNoteDuration) {
      notes.push({
        note: (currentNote as any).note,
        startTime: (currentNote as any).startTime,
        duration: dur,
        velocity: 90
      });
    }
  }

  // Pós-processamento: Filtro de mediana / consolidação de pontes curtas
  // Une notas iguais separadas por pausas muito de até 0.1s
  const processedNotes: SimpleNote[] = [];
  if (notes.length > 0) {
    let pendingNote = { ...notes[0] };

    for (let i = 1; i < notes.length; i++) {
      const nextNote = notes[i];
      const gap = nextNote.startTime - (pendingNote.startTime + pendingNote.duration);

      if (nextNote.note === pendingNote.note && gap <= 0.15) {
        // Concatena aumentando a duração
        pendingNote.duration = (nextNote.startTime + nextNote.duration) - pendingNote.startTime;
      } else {
        processedNotes.push(pendingNote);
        pendingNote = { ...nextNote };
      }
    }
    processedNotes.push(pendingNote);
  }

  return processedNotes;
}

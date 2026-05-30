import React, { useState, useRef, useEffect } from "react";
import { 
  Compass, Trash2, Play, Pause, AlertTriangle, 
  CheckCircle, Music, Radio, ChevronUp, ChevronDown, 
  Activity, Cloud, CloudDownload, CloudUpload, RefreshCw, 
  LogOut, FolderOpen
} from "lucide-react";
import { MidiFile, parseMidi, writeMidi, mergeMidis, createMidiFromNotes } from "../utils/midiHelper";
import { MidiSynthEngine, MidiFilePlayer } from "../utils/midiPlayer";
import { 
  initAuth, 
  googleSignIn, 
  logoutUser, 
  listMidiFiles, 
  downloadDriveFile, 
  uploadMidiToDrive, 
  DriveMidiFile 
} from "../utils/googleDrive";

interface UploadedMidi {
  id: string;
  name: string;
  size: number;
  midiFile: MidiFile;
}

// Retro interface Sound FX helper
const playSystemSound = (frequency = 1000, duration = 0.05, type: OscillatorType = "sine", volume = 0.08) => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    
    if (frequency > 600 && type === "sine") {
      osc.frequency.exponentialRampToValueAtTime(frequency * 0.7, audioCtx.currentTime + duration);
    }
    
    gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (err) {
    // Fail silently if browser blocks audio context prior to user interaction
  }
};

export const MidiMerger: React.FC = () => {
  const [midis, setMidis] = useState<UploadedMidi[]>([]);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTicks, setCurrentTicks] = useState(0);

  // Google Drive and Auth Integrations State
  const [driveUser, setDriveUser] = useState<any>(null);
  const [driveToken, setDriveToken] = useState<string | null>(null);
  const [driveFiles, setDriveFiles] = useState<DriveMidiFile[]>([]);
  const [isQueryingDrive, setIsQueryingDrive] = useState(false);
  const [driveSearchText, setDriveSearchText] = useState("");
  const [driveError, setDriveError] = useState<string | null>(null);
  const [isUploadingToDrive, setIsUploadingToDrive] = useState(false);
  const [isImportingFileId, setIsImportingFileId] = useState<string | null>(null);
  const [activeRightTab, setActiveRightTab] = useState<"drive" | "presets">("presets");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const synthEngineRef = useRef<MidiSynthEngine | null>(null);
  const filePlayerRef = useRef<MidiFilePlayer | null>(null);

  // Listen for active Google Authentication sessions
  useEffect(() => {
    const unsubscribe = initAuth(
      (user, token) => {
        setDriveUser(user);
        setDriveToken(token);
        // Automatically fetch files on connection established
        fetchDriveFilesList(token);
      },
      () => {
        setDriveUser(null);
        setDriveToken(null);
        setDriveFiles([]);
      }
    );
    return () => unsubscribe();
  }, []);

  const fetchDriveFilesList = async (token: string) => {
    setIsQueryingDrive(true);
    setDriveError(null);
    try {
      const files = await listMidiFiles(token);
      setDriveFiles(files);
    } catch (err: any) {
      setDriveError(err.message || "Erro desconhecido ao obter arquivos do Google Drive.");
    } finally {
      setIsQueryingDrive(false);
    }
  };

  const handleGoogleLogin = async () => {
    playSystemSound(600, 0.08);
    try {
      const res = await googleSignIn();
      if (res) {
        setDriveUser(res.user);
        setDriveToken(res.accessToken);
        playSystemSound(1205, 0.15, "sine");
        setSuccessMessage("OPERAÇÃO SATÉLITE INICIADA: Conectado ao Google Drive com sucesso!");
        setActiveRightTab("drive");
        fetchDriveFilesList(res.accessToken);
      }
    } catch (err: any) {
      playSystemSound(180, 0.3, "sawtooth");
      setError(`Falha de Autenticação na Nuvem: ${err.message || "Erro desconhecido"}`);
    }
  };

  const handleGoogleLogout = async () => {
    playSystemSound(400, 0.1, "triangle");
    try {
      await logoutUser();
      setDriveUser(null);
      setDriveToken(null);
      setDriveFiles([]);
      setSuccessMessage("SISTEMA DESCONECTADO: Conexão com Google Drive encerrada.");
    } catch (err: any) {
      setError(`Erro ao desconectar: ${err.message}`);
    }
  };

  const handleImportDriveFile = async (file: DriveMidiFile) => {
    if (!driveToken) return;
    playSystemSound(800, 0.05);
    setIsImportingFileId(file.id);
    setDriveError(null);
    setError(null);
    setSuccessMessage(null);

    try {
      const arrayBuffer = await downloadDriveFile(file.id, driveToken);
      const bytes = new Uint8Array(arrayBuffer);
      const parsed = parseMidi(bytes);

      const sizeInBytes = file.size ? parseInt(file.size) : bytes.byteLength;

      setMidis(prev => [
        ...prev,
        {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          size: sizeInBytes,
          midiFile: parsed
        }
      ]);

      playSystemSound(1400, 0.12, "sine");
      setSuccessMessage(`SINAL RECEBIDO: Arquivo "${file.name}" importado do Google Drive com sucesso!`);
    } catch (err: any) {
      playSystemSound(180, 0.35, "sawtooth");
      setDriveError(`Falha ao decodificar sinal remoto: ${err.message}`);
    } finally {
      setIsImportingFileId(null);
    }
  };

  const handleMergeAndSaveToDrive = async () => {
    setError(null);
    setSuccessMessage(null);

    if (midis.length < 2) {
      playSystemSound(220, 0.25, "sawtooth");
      setError("Falta de sinal: Adicione pelo menos 2 arquivos no radar para realizar o agrupamento.");
      return;
    }

    if (!driveToken) {
      setError("Módulo de nuvem offline. Por favor, conecte ao Google Drive primeiro.");
      return;
    }

    // MANDATORY USER CONFIRMATION check
    const confirmed = window.confirm(
      `Confirmar Transmissão de Sinal:\n\nVocê deseja compilar a sequência de ${midis.length} arquivos MIDI e transmiti-la diretamente para a sua conta do Google Drive?`
    );
    if (!confirmed) {
      setError("Gravação em nuvem suspensa pelo operador.");
      return;
    }

    playSystemSound(700, 0.08);
    setTimeout(() => playSystemSound(1000, 0.08), 80);
    setTimeout(() => playSystemSound(1400, 0.15, "sine"), 160);

    setIsUploadingToDrive(true);

    try {
      const parsedFiles = midis.map(m => m.midiFile);
      const mergedMidi = mergeMidis(parsedFiles, "sequence");

      const compiledBytes = writeMidi(mergedMidi);
      const blob = new Blob([compiledBytes], { type: "audio/midi" });
      const suggestedName = `FUSAO_COMBINADA_${Date.now().toString().slice(-6)}.mid`;

      await uploadMidiToDrive(suggestedName, blob, driveToken);

      setSuccessMessage(`TRANSMISSÃO TELEMÉTRICA EFETUADA! O arquivo "${suggestedName}" foi gravado com sucesso no seu Google Drive.`);
      
      // Update the Drive file list
      fetchDriveFilesList(driveToken);
    } catch (err: any) {
      playSystemSound(180, 0.35, "sawtooth");
      setError(`Falha de Gravação Remota: ${err.message || "Erro indefinido na transmissão"}`);
    } finally {
      setIsUploadingToDrive(false);
    }
  };

  // Stop playback on dismount
  useEffect(() => {
    return () => {
      if (filePlayerRef.current) {
        filePlayerRef.current.stop();
      }
    };
  }, []);

  // Sync player when midis changes
  useEffect(() => {
    if (filePlayerRef.current) {
      if (midis.length === 0) {
        filePlayerRef.current.stop();
        setIsPlaying(false);
        setProgress(0);
      } else {
        const wasPlaying = filePlayerRef.current.getIsPlaying();
        filePlayerRef.current.stop();
        
        try {
          const targetMidis = midis.map(m => m.midiFile);
          const activeMidi = targetMidis.length >= 2 
            ? mergeMidis(targetMidis, "sequence")
            : targetMidis[0];
          
          if (activeMidi) {
            filePlayerRef.current.loadFile(activeMidi);
            if (wasPlaying) {
              filePlayerRef.current.play();
            }
          }
        } catch {
          // Silent catch for initial load
        }
      }
    }
  }, [midis]);

  // Process files loaded via dialog or drop
  const processFiles = async (files: FileList) => {
    setError(null);
    setSuccessMessage(null);
    const newMidis: UploadedMidi[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const hasMidiExtension = file.name.toLowerCase().endsWith(".mid") || file.name.toLowerCase().endsWith(".midi");
      
      if (!hasMidiExtension) {
        playSystemSound(220, 0.25, "triangle", 0.12);
        setError(`Apenas arquivos MIDI com extensão .mid ou .midi são aceitos.`);
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const parsed = parseMidi(bytes);
        
        newMidis.push({
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name: file.name,
          size: file.size,
          midiFile: parsed
        });
      } catch (err: any) {
        playSystemSound(180, 0.3, "sawtooth", 0.1);
        setError(`Erro no arquivo "${file.name}": ${err.message || "Formato inválido"}`);
      }
    }

    if (newMidis.length > 0) {
      playSystemSound(850, 0.08);
      setTimeout(() => playSystemSound(1250, 0.12), 65);
      
      setMidis(prev => [...prev, ...newMidis]);
      setSuccessMessage(`${newMidis.length} arquivo(s) MIDI carregado(s) com sucesso.`);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(files);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    if (!isDragging) {
      playSystemSound(380, 0.03, "sine", 0.05);
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      processFiles(files);
    }
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === midis.length - 1) return;

    playSystemSound(1100, 0.04);
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    const updated = [...midis];
    const temp = updated[index];
    updated[index] = updated[targetIdx];
    updated[targetIdx] = temp;
    setMidis(updated);
  };

  const removeItem = (id: string) => {
    playSystemSound(450, 0.08, "triangle");
    setMidis(prev => prev.filter(m => m.id !== id));
    setSuccessMessage(null);
  };

  const handleMerge = async () => {
    setError(null);
    setSuccessMessage(null);

    if (midis.length < 2) {
      playSystemSound(220, 0.25, "sawtooth");
      setError("Falta de sinal: Adicione pelo menos 2 arquivos no radar para realizar o agrupamento.");
      return;
    }

    playSystemSound(700, 0.08);
    setTimeout(() => playSystemSound(1000, 0.08), 80);
    setTimeout(() => playSystemSound(1300, 0.12), 160);

    try {
      const parsedFiles = midis.map(m => m.midiFile);
      const mergedMidi = mergeMidis(parsedFiles, "sequence");

      const compiledBytes = writeMidi(mergedMidi);
      const blob = new Blob([compiledBytes], { type: "audio/midi" });
      const suggestedName = `FUSAO_COMBINADA_${Date.now().toString().slice(-6)}.mid`;

      if ("showSaveFilePicker" in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: suggestedName,
            types: [
              {
                description: "Arquivos MIDI (*.mid)",
                accept: { "audio/midi": [".mid", ".midi"] }
              }
            ]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          setSuccessMessage("GRAVAÇÃO METÁLICA CONCLUÍDA! Arquivo consolidado e salvo na pasta escolhida.");
          return;
        } catch (err: any) {
          if (err.name === "AbortError") {
            setError("Gravação manual cancelada pelo operador.");
            return;
          }
        }
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = suggestedName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setSuccessMessage(`ARQUIVO COMPILADO! Iniciando download automático de: "${suggestedName}"`);
    } catch (err: any) {
      setError(`Erro na fusão do sinal: ${err.message || "Falha indeterminada"}`);
    }
  };

  const handlePlayToggle = () => {
    if (midis.length === 0) {
      playSystemSound(220, 0.3, "sawtooth", 0.12);
      setError("Sinal Indisponível: Envie dados no radar para operar o sequenciador.");
      return;
    }

    playSystemSound(1200, 0.06);

    if (!synthEngineRef.current) {
      synthEngineRef.current = new MidiSynthEngine();
    }
    if (!filePlayerRef.current) {
      filePlayerRef.current = new MidiFilePlayer(synthEngineRef.current);
      
      filePlayerRef.current.onProgress((ticks, percent) => {
        setProgress(percent);
        setCurrentTicks(ticks);
      });
      filePlayerRef.current.onFinished(() => {
        setIsPlaying(false);
        setProgress(0);
        setCurrentTicks(0);
        playSystemSound(900, 0.1, "sine", 0.06);
        setTimeout(() => playSystemSound(600, 0.15, "sine", 0.05), 90);
      });
    }

    const player = filePlayerRef.current;
    if (player.getIsPlaying()) {
      player.pause();
      setIsPlaying(false);
    } else {
      try {
        const targetMidis = midis.map(m => m.midiFile);
        if (targetMidis.length > 0) {
          const merged = targetMidis.length >= 2 
            ? mergeMidis(targetMidis, "sequence")
            : targetMidis[0];
          
          player.loadFile(merged);
          player.play();
          setIsPlaying(true);
          setError(null);
        }
      } catch (err: any) {
        playSystemSound(220, 0.2, "sawtooth");
        setError(`Falha ao injetar notas ao motor: ${err.message}`);
      }
    }
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!filePlayerRef.current || midis.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickedPercentage = clickX / rect.width;
    
    playSystemSound(1400, 0.03, "sine", 0.04);
    filePlayerRef.current.seek(clickedPercentage);
    setProgress(clickedPercentage);
  };

  const handleLoadDemo = (type: "piano" | "bass" | "synth") => {
    setError(null);
    setSuccessMessage(null);
    playSystemSound(600, 0.05, "sine");
    setTimeout(() => playSystemSound(1000, 0.07, "sine"), 50);

    try {
      let parsed: MidiFile;
      let name = "";
      const size = 380;

      if (type === "piano") {
        const notes = [
          { note: 60, startTime: 0.0, duration: 0.8, velocity: 90 }, // C4
          { note: 64, startTime: 0.0, duration: 0.8, velocity: 90 }, // E4
          { note: 67, startTime: 0.0, duration: 0.8, velocity: 90 }, // G4
          
          { note: 62, startTime: 1.0, duration: 0.8, velocity: 90 }, // D4
          { note: 65, startTime: 1.0, duration: 0.8, velocity: 90 }, // F4
          { note: 69, startTime: 1.0, duration: 0.8, velocity: 90 }, // A4
          
          { note: 64, startTime: 2.0, duration: 0.8, velocity: 95 }, // E4
          { note: 67, startTime: 2.0, duration: 0.8, velocity: 95 }, // G4
          { note: 71, startTime: 2.0, duration: 0.8, velocity: 95 }, // B4
          
          { note: 60, startTime: 3.0, duration: 1.2, velocity: 100 }, // C4
        ];
        parsed = createMidiFromNotes(notes, 0, 480, 100);
        name = "TIMBRE_PIANO_SINAL.mid";
      } else if (type === "bass") {
        const notes = [
          { note: 36, startTime: 0.0, duration: 0.4, velocity: 110 }, // C2
          { note: 36, startTime: 0.5, duration: 0.2, velocity: 100 },
          { note: 43, startTime: 0.8, duration: 0.2, velocity: 105 }, // G2
          
          { note: 41, startTime: 1.0, duration: 0.4, velocity: 110 }, // F2
          { note: 41, startTime: 1.5, duration: 0.2, velocity: 100 },
          { note: 48, startTime: 1.8, duration: 0.2, velocity: 105 },
          
          { note: 36, startTime: 2.0, duration: 1.0, velocity: 115 },
        ];
        parsed = createMidiFromNotes(notes, 33, 480, 100);
        name = "TIMBRE_BAIXO_CONSOLE.mid";
      } else {
        const notes = [
          { note: 72, startTime: 0.0, duration: 0.2, velocity: 85 }, // C5
          { note: 74, startTime: 0.2, duration: 0.2, velocity: 85 }, // D5
          { note: 76, startTime: 0.4, duration: 0.2, velocity: 90 }, // E5
          { note: 79, startTime: 0.6, duration: 0.4, velocity: 100 }, // G5
          { note: 76, startTime: 1.0, duration: 0.8, velocity: 95 },
        ];
        parsed = createMidiFromNotes(notes, 81, 480, 100); // 81 = Lead Sawtooth
        name = "SINAL_SINT_LEAD.mid";
      }

      setMidis(prev => [
        ...prev,
        {
          id: `${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          name,
          size,
          midiFile: parsed,
        }
      ]);
      setSuccessMessage(`Sinal de teste gerado: "${name}"`);
    } catch (err: any) {
      setError(`Falha ao sintetizar sinal demo: ${err.message}`);
    }
  };

  const handleLoadMultipleDemos = (count: 2 | 4 | 6) => {
    setError(null);
    setSuccessMessage(null);
    playSystemSound(600, 0.05, "sine");
    setTimeout(() => playSystemSound(1000, 0.07, "sine"), 50);

    try {
      const generated: UploadedMidi[] = [];
      const timestamp = Date.now();

      const pianoNotes = [
        { note: 60, startTime: 0.0, duration: 0.8, velocity: 90 },
        { note: 64, startTime: 0.0, duration: 0.8, velocity: 90 },
        { note: 67, startTime: 0.0, duration: 0.8, velocity: 90 },
        { note: 62, startTime: 1.0, duration: 0.8, velocity: 90 },
        { note: 65, startTime: 1.0, duration: 0.8, velocity: 90 },
        { note: 69, startTime: 1.0, duration: 0.8, velocity: 90 },
        { note: 64, startTime: 2.0, duration: 1.5, velocity: 100 }
      ];
      
      const bassNotes = [
        { note: 36, startTime: 0.0, duration: 0.5, velocity: 110 },
        { note: 43, startTime: 0.5, duration: 0.5, velocity: 100 },
        { note: 41, startTime: 1.0, duration: 0.5, velocity: 110 },
        { note: 48, startTime: 1.5, duration: 0.5, velocity: 100 },
        { note: 36, startTime: 2.0, duration: 1.5, velocity: 115 }
      ];

      const leadNotes = [
        { note: 72, startTime: 0.0, duration: 0.3, velocity: 85 },
        { note: 74, startTime: 0.3, duration: 0.3, velocity: 85 },
        { note: 76, startTime: 0.6, duration: 0.3, velocity: 90 },
        { note: 79, startTime: 0.9, duration: 0.6, velocity: 100 },
        { note: 81, startTime: 1.5, duration: 1.0, velocity: 95 }
      ];

      const padNotes = [
        { note: 48, startTime: 0.0, duration: 1.2, velocity: 70 },
        { note: 52, startTime: 1.2, duration: 1.2, velocity: 70 },
        { note: 55, startTime: 2.4, duration: 1.6, velocity: 75 }
      ];

      const bellNotes = [
        { note: 84, startTime: 0.2, duration: 0.4, velocity: 95 },
        { note: 86, startTime: 0.6, duration: 0.4, velocity: 95 },
        { note: 88, startTime: 1.0, duration: 0.4, velocity: 100 },
        { note: 91, startTime: 1.4, duration: 1.0, velocity: 105 }
      ];

      const stringNotes = [
        { note: 57, startTime: 0.0, duration: 1.0, velocity: 75 },
        { note: 60, startTime: 1.0, duration: 1.0, velocity: 75 },
        { note: 65, startTime: 2.0, duration: 2.0, velocity: 80 }
      ];

      const tracksData = [
        { name: "01_PIANO_SINAL.mid", notes: pianoNotes, instrument: 0, size: 412 },
        { name: "02_BAIXO_PULSO.mid", notes: bassNotes, instrument: 33, size: 368 },
        { name: "03_SINT_LEAD.mid", notes: leadNotes, instrument: 81, size: 350 },
        { name: "04_ESPACIAL_PAD.mid", notes: padNotes, instrument: 89, size: 320 },
        { name: "05_SACHET_SINOS.mid", notes: bellNotes, instrument: 9, size: 380 },
        { name: "06_CORDAS_ORQ.mid", notes: stringNotes, instrument: 48, size: 340 }
      ];

      for (let i = 0; i < count; i++) {
        const tr = tracksData[i];
        const parsed = createMidiFromNotes(tr.notes, tr.instrument, 480, 100);
        generated.push({
          id: `${timestamp}_preset_${i}_${Math.random().toString(36).substr(2, 4)}`,
          name: tr.name,
          size: tr.size,
          midiFile: parsed
        });
      }

      setMidis(prev => [...prev, ...generated]);
      setSuccessMessage(`CONECTADO: Lote de ${count} Arquivos MIDI Carregado com Sucesso.`);
    } catch (err: any) {
      setError(`Falha ao gerar o lote de teste: ${err.message}`);
    }
  };

  const filteredMidis = midis.filter(m =>
    m.name.toLowerCase().includes(searchText.toLowerCase())
  );

  const getBlipCoordinates = (id: string, index: number, count: number) => {
    let seed = 0;
    for (let c = 0; c < id.length; c++) {
      seed += id.charCodeAt(c);
    }
    const angle = (index * (2 * Math.PI / Math.max(count, 4))) + (seed % 90) * 0.01;
    const radius = 35 + ((seed + index * 9) % 42);
    
    const x = 100 + radius * Math.cos(angle);
    const y = 100 + radius * Math.sin(angle);
    return { x, y };
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
  };

  return (
    <div className="w-full max-w-full mx-auto select-none px-2 sm:px-4 lg:px-6 py-1.5">
      
      {/* PHYSICAL BRUSHED METAL CHASSIS CONTAINER */}
      <div className="brushed-metal border-[3px] border-zinc-900 rounded-2xl p-3 sm:p-5 relative shadow-[0_15px_40px_rgba(0,0,0,0.85)] w-full max-w-none">
        
        {/* Real Steel Screw Rivets on Console corners */}
        <div className="absolute top-2 left-2"><div className="rivet"></div></div>
        <div className="absolute top-2 right-2"><div className="rivet"></div></div>
        <div className="absolute bottom-2 left-2"><div className="rivet"></div></div>
        <div className="absolute bottom-2 right-2"><div className="rivet"></div></div>

        {/* SIDE DECORATIVE SLATS/VENTILATION REELS */}
        <div className="absolute left-[-6px] top-1/4 bottom-1/4 w-[6px] bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-950 border border-zinc-900 rounded-l hidden sm:block"></div>
        <div className="absolute right-[-6px] top-1/4 bottom-1/4 w-[6px] bg-gradient-to-r from-zinc-950 via-zinc-800 to-zinc-950 border border-zinc-900 rounded-r hidden sm:block"></div>

        {/* CONSOLE MASTER SHIFT PLATFORMS */}
        <div className="space-y-3">
          
          {/* 1. TOP PIECE: THE TACTICAL TECH-NOIR RADAR */}
          <div className="flex flex-col items-center justify-center">
            <div className="relative w-32 h-32 sm:w-40 sm:h-40 rounded-full border-4 border-zinc-850 p-1 bg-zinc-950/90 shadow-[inset_0_4px_20px_rgba(0,0,0,0.9),0_10px_20px_rgba(0,0,0,0.8)] crt-screen overflow-hidden">
              
              {/* Dark monitor screen scanlines sweeps */}
              <div className="scanline-sweep"></div>
              
              {/* File Input Activator Button behind the radar */}
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileUpload}
                multiple={true}
                accept=".mid, .midi"
                className="hidden"
                id="radar-midi-uploader"
              />

              {/* RADAR TARGETING ZONE */}
              <div 
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  playSystemSound(1000, 0.05);
                  fileInputRef.current?.click();
                }}
                className={`w-full h-full rounded-full cursor-pointer transition-all duration-300 relative ${
                  isDragging 
                    ? "bg-lime-950/35 scale-[1.01] border-2 border-lime-400 border-dashed" 
                    : "hover:bg-zinc-950/40"
                }`}
                role="button"
                title="Clique ou arraste arquivos MIDI neste radar"
              >
                
                <svg className="w-full h-full select-none" viewBox="0 0 200 200">
                  <defs>
                    <radialGradient id="radar-glow" cx="50%" cy="50%" r="50%">
                      <stop offset="0%" stopColor="#22c55e" stopOpacity="0.18" />
                      <stop offset="45%" stopColor="#15803d" stopOpacity="0.06" />
                      <stop offset="100%" stopColor="#022c22" stopOpacity="0" />
                    </radialGradient>
                  </defs>

                  {/* Circular screen glow */}
                  <circle cx="100" cy="100" r="96" fill="url(#radar-glow)" />

                  {/* Concentric grid rings */}
                  <circle cx="100" cy="100" r="95" fill="none" stroke="#22c55e" strokeWidth="0.8" strokeDasharray="3 3" opacity="0.3" />
                  <circle cx="100" cy="100" r="72" fill="none" stroke="#22c55e" strokeWidth="0.6" opacity="0.45" />
                  <circle cx="100" cy="100" r="48" fill="none" stroke="#22c55e" strokeWidth="0.5" opacity="0.45" />
                  <circle cx="100" cy="100" r="24" fill="none" stroke="#22c55e" strokeWidth="0.5" strokeDasharray="1 1" opacity="0.5" />
                  
                  {/* Crosshair guide lines */}
                  <line x1="4" y1="100" x2="196" y2="100" stroke="#22c55e" strokeWidth="0.5" opacity="0.32" />
                  <line x1="100" y1="4" x2="100" y2="196" stroke="#22c55e" strokeWidth="0.5" opacity="0.32" />

                  {/* Sub-degree markings */}
                  <text x="100" y="11" fill="#bef264" fontSize="5" textAnchor="middle" fontFamily="monospace" fontWeight="bold">000°</text>
                  <text x="194" y="102" fill="#bef264" fontSize="5" textAnchor="start" fontFamily="monospace" fontWeight="bold">090°</text>
                  <text x="100" y="196" fill="#bef264" fontSize="5" textAnchor="middle" fontFamily="monospace" fontWeight="bold">180°</text>
                  <text x="6" y="102" fill="#bef264" fontSize="5" textAnchor="end" fontFamily="monospace" fontWeight="bold">270°</text>

                  {/* Scanning radar line rotating sweep */}
                  <g className="radar-sweep-line" style={{ transformOrigin: "100px 100px" }}>
                    <line x1="100" y1="100" x2="100" y2="5" stroke="#a3e635" strokeWidth="1.2" strokeLinecap="round" />
                    <path d="M 100,100 L 100,5 A 95 95 0 0 1 145,21.5 Z" fill="rgba(163, 230, 53, 0.12)" pointerEvents="none" />
                    <circle cx="100" cy="100" r="1.5" fill="#a3e635" />
                  </g>

                  {/* Rendering track coordinates/target blips */}
                  {filteredMidis.map((midi, index) => {
                    const { x, y } = getBlipCoordinates(midi.id, index, midis.length);
                    const isMatched = searchText !== "" && midi.name.toLowerCase().includes(searchText.toLowerCase());
                    
                    return (
                      <g key={midi.id} className="cursor-pointer transition-opacity duration-300">
                        {/* Outer flashing lock cursor box if filtered/selected */}
                        {isMatched && (
                          <rect 
                            x={x - 6} 
                            y={y - 6} 
                            width="12" 
                            height="12" 
                            fill="none" 
                            stroke="#ef4444" 
                            strokeWidth="0.75" 
                            className="animate-pulse"
                          />
                        )}

                        {/* Blip central core dot */}
                        <circle cx={x} cy={y} r="3" fill={isMatched ? "#f87171" : "#bef264"} className="z-20" />
                        
                        {/* Expanding glowing sonar ping radius ring */}
                        <circle 
                          cx={x} 
                          cy={y} 
                          r="9" 
                          fill="none" 
                          stroke={isMatched ? "#f87171" : "#bef264"} 
                          strokeWidth="0.5" 
                          className="animate-ping" 
                          style={{ animationDuration: "2.8s" }} 
                        />
                        
                        {/* High-tech pointer trace wire to metadata label */}
                        <line x1={x} y1={y} x2={x + 10} y2={y - 8} stroke={isMatched ? "#f87171" : "#a3e635"} strokeWidth="0.4" opacity="0.65" />
                        <line x1={x + 10} y1={y - 8} x2={x + 32} y2={y - 8} stroke={isMatched ? "#f87171" : "#a3e635"} strokeWidth="0.4" opacity="0.65" />
                        
                        {/* Monospaced text callout with track sequence position */}
                        <text 
                          x={x + 12} 
                          y={y - 11} 
                          fill={isMatched ? "#ef4444" : "#bef264"} 
                          fontSize="5.2" 
                          fontFamily="monospace" 
                          fontWeight="bold" 
                          textAnchor="start"
                        >
                          T{index + 1}:{midi.name.substring(0, 7).replace(/\.[^/.]+$/, "")}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Empty state radar display overlays */}
                {midis.length === 0 && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-2 pointer-events-none z-10 font-mono">
                    <Compass className="w-8 h-8 text-lime-500/25 animate-spin" style={{ animationDuration: '30s' }} />
                    <p className="text-[9px] text-[#a3e635] font-bold tracking-widest mt-2 px-2 uppercase bg-black/45 border border-lime-900/30 rounded py-0.5 animate-pulse">
                      RADAR DISPONÍVEL
                    </p>
                    <p className="text-[7.5px] text-zinc-550 max-w-[130px] leading-snug mt-1 uppercase">
                      Solte vários MIDIs aqui ou clique em buscar
                    </p>
                  </div>
                )}

                {/* Operational status tags around bezel inner margins */}
                <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 bg-black/75 border border-zinc-800/80 rounded px-2 py-0.5 pointer-events-none z-10">
                  <span className="font-mono text-[7px] font-bold text-lime-400 tracking-widest uppercase flex items-center gap-1 leading-none">
                    <span className="w-1 h-1 rounded-full bg-lime-400 led-blink-green inline-block"></span>
                    RADAR DISP
                  </span>
                </div>
              </div>
            </div>
          </div>
          {/* 2. CENTER PIECE: 'JUNTAR MiDi' ACTION BUTTON */}
          <div className={`grid grid-cols-1 ${driveToken ? "sm:grid-cols-2" : ""} gap-3`}>
            <div className="relative group">
              <button
                type="button"
                onClick={handleMerge}
                className={`w-full py-2.5 px-4 rounded-lg border border-zinc-900 transition-all duration-300 relative overflow-hidden flex flex-col items-center justify-center cursor-pointer ${
                  midis.length >= 2 
                    ? "bg-gradient-to-b from-[#22c55e]/15 to-[#16a34a]/5 hover:from-[#22c55e]/30 hover:to-[#16a34a]/15 text-lime-400 border-lime-500/50 neon-box-green-heavy"
                    : "bg-zinc-950/90 text-zinc-650 opacity-90 border-zinc-800/80 cursor-not-allowed hover:bg-zinc-950"
                }`}
                id="btn-juntar-midi-top"
              >
                {/* Visual grid overlay for LCD feel */}
                <div className="absolute inset-0 bg-grid opacity-[0.03] pointer-events-none"></div>

                <div className="flex items-center gap-2">
                  {/* Flashing green power neon LED indicator */}
                  <div className={`w-2 h-2 rounded-full border border-black/40 ${
                    midis.length >= 2 ? "bg-lime-400 led-blink-green-fast" : "bg-zinc-800"
                  }`}></div>
                  
                  <span className="text-sm font-extrabold uppercase tracking-[0.15em] font-mono select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] neon-glow-green">
                    SALVAR LOCALMENTE
                  </span>
                  
                  <div className={`w-2 h-2 rounded-full border border-black/40 ${
                    midis.length >= 2 ? "bg-lime-400 led-blink-green-fast" : "bg-zinc-800"
                  }`}></div>
                </div>

                {/* Subtext info panel */}
                <div className="mt-0.5 font-mono text-[8px] font-bold tracking-widest uppercase">
                  {midis.length >= 2 ? (
                    <span className="text-lime-400 animate-pulse">● EXPORTAR ARQUIVO COMPILADO ({midis.length} SLOTS)</span>
                  ) : (
                    <span className="text-zinc-650 tracking-wider">● RECEPTOR INATIVO</span>
                  )}
                </div>
              </button>
            </div>

            {driveToken && (
              <div className="relative group animate-fade-in">
                <button
                  type="button"
                  onClick={handleMergeAndSaveToDrive}
                  disabled={isUploadingToDrive || midis.length < 2}
                  className={`w-full py-2.5 px-4 rounded-lg border border-zinc-900 transition-all duration-300 relative overflow-hidden flex flex-col items-center justify-center cursor-pointer ${
                    midis.length >= 2 && !isUploadingToDrive
                      ? "bg-gradient-to-b from-[#3b82f6]/15 to-[#1d4ed8]/5 hover:from-[#3b82f6]/30 hover:to-[#1d4ed8]/15 text-blue-400 border-blue-500/50 shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_20px_rgba(59,130,246,0.5)]"
                      : "bg-zinc-950/90 text-zinc-650 opacity-90 border-zinc-800/80 cursor-not-allowed hover:bg-zinc-950"
                  }`}
                  id="btn-salvar-drive"
                >
                  {/* Visual grid overlay for LCD feel */}
                  <div className="absolute inset-0 bg-grid opacity-[0.03] pointer-events-none"></div>

                  <div className="flex items-center gap-2">
                    {isUploadingToDrive ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    ) : (
                      <div className={`w-2 h-2 rounded-full border border-black/40 ${
                        midis.length >= 2 ? "bg-blue-400 led-blink-blue-fast" : "bg-zinc-800"
                      }`}></div>
                    )}
                    
                    <span className="text-sm font-extrabold uppercase tracking-[0.15em] font-mono select-none drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] text-blue-400">
                      {isUploadingToDrive ? "TRANSMITINDO..." : "SALVAR NO GOOGLE DRIVE"}
                    </span>
                    
                    {!isUploadingToDrive && (
                      <div className={`w-2 h-2 rounded-full border border-black/40 ${
                        midis.length >= 2 ? "bg-blue-400 led-blink-blue-fast" : "bg-zinc-800"
                      }`}></div>
                    )}
                  </div>

                  <div className="mt-0.5 font-mono text-[8px] font-bold tracking-widest uppercase">
                    {midis.length >= 2 ? (
                      <span className="text-blue-400 animate-pulse">● ENVIAR DIRETO PARA NUVEM ({midis.length} SLOTS)</span>
                    ) : (
                      <span className="text-zinc-650 tracking-wider">● RECEPTOR INATIVO</span>
                    )}
                  </div>
                </button>
              </div>
            )}
          </div>

          {/* 3. RETRO COMMAND LINE: "BUSCAR MiDi" SEARCH TERMINAL */}
          <div className="space-y-1">
            <div className="bg-zinc-950/90 border border-zinc-800 rounded-lg p-1.5 flex items-center gap-2 shadow-inner focus-within:border-lime-500/50 transition-colors">
              <span className="font-mono text-[9px] font-extrabold text-lime-400 tracking-wider whitespace-nowrap pl-1">
                &gt; BUSCAR MiDi :
              </span>
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="DIGITE NOME PARA FILTRAR FILA E NOTAS..."
                className="bg-transparent text-lime-400 placeholder:text-zinc-700 text-xs font-mono tracking-wide focus:outline-none w-full uppercase"
                maxLength={40}
              />
              {searchText && (
                <button
                  onClick={() => { setSearchText(""); playSystemSound(600, 0.05); }}
                  className="text-[9px] font-mono text-zinc-500 hover:text-red-400 font-bold uppercase tracking-wider px-1 bg-zinc-900 border border-zinc-850 rounded cursor-pointer"
                >
                  CLR
                </button>
              )}
            </div>
          </div>

          {/* 4. HORIZONTAL SEPARATION PROGRESS: 'MUSIC PROGRES' RATINGS */}
          <div className="space-y-1">
            <div className="flex items-center justify-between font-mono text-[8px] font-bold text-lime-400/90 tracking-wider">
              <span>[ MUSIC PROGRES ]</span>
              <span className="text-zinc-500 uppercase font-bold">
                {isPlaying ? (
                  <span className="text-lime-400">PLAYING : {Math.round(progress * 100)}%</span>
                ) : (
                  <span>STANDBY : {midis.length} TRACKS</span>
                )}
              </span>
            </div>
            
            {/* Thick progress panel custom track slot */}
            <div 
              className="bg-zinc-950 border border-zinc-900 rounded-md h-5.5 p-0.5 flex items-center relative overflow-hidden select-none shadow-inner cursor-pointer"
              onClick={handleProgressBarClick}
            >
              {/* Micro horizontal ticks indicators */}
              <div className="absolute inset-0 flex justify-between px-2 pointer-events-none opacity-20">
                {Array.from({ length: 40 }).map((_, rIdx) => (
                  <span key={rIdx} className="w-[1px] h-full bg-lime-400"></span>
                ))}
              </div>

              {/* Internal green glowing progress block */}
              <div 
                className="h-full bg-gradient-to-r from-lime-500/20 via-lime-500/40 to-lime-400/60 rounded-sm relative transition-all duration-100 neon-box-green"
                style={{ width: `${progress * 100}%` }}
              >
                {/* Glowing lightning tip vertical pointer notch */}
                <div className="absolute right-0 top-0 bottom-0 w-1 bg-lime-300 shadow-[0_0_8px_rgba(163,230,53,1)] rounded-md animate-pulse"></div>
              </div>

              {/* Embedded technical track time counter */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <span className="font-mono text-[8px] tracking-widest text-[#a3e635] font-bold uppercase drop-shadow-[0_1px_2px_rgba(0,0,0,0.85)]">
                  {midis.length > 0 
                    ? `TICKS: ${Math.round(currentTicks)}` 
                    : "SISTEMA DESCONECTADO - COLOQUE MIDIs"
                  }
                </span>
              </div>
            </div>
          </div>

          {/* 5. OVERSIZED GREEN MECHANICAL PLAY BUTTON AT THE BASE */}
          <div className="flex justify-center pt-1">
            <button
              type="button"
              onClick={handlePlayToggle}
              className={`w-12 h-12 rounded-full border-[3px] border-zinc-900 flex items-center justify-center transition-all duration-300 relative uppercase cursor-pointer select-none active:scale-95 z-20 ${
                isPlaying 
                  ? "bg-lime-400 text-black shadow-[0_0_15px_rgba(163,230,53,1)] scale-[1.03]" 
                  : "bg-zinc-950 text-lime-400 hover:text-lime-300 hover:bg-zinc-900 border border-lime-400/30 shadow-[0_3px_8px_rgba(0,0,0,0.8)]"
              }`}
              title={isPlaying ? "Pausar Reprodução" : "Iniciar Reprodução do MIDI Sequenciado"}
              id="btn-play-base"
            >
              {/* Physical radial shine metal bevel border effect */}
              <div className="absolute inset-0 border border-white/5 rounded-full pointer-events-none"></div>

              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current stroke-[2.5]" />
              ) : (
                <Play className="w-5 h-5 fill-current translate-x-0.5 stroke-[2.5]" />
              )}
            </button>
          </div>

          {/* 6. EXPANDED BOTTOM PANEL: RECEPTACLE DECK FOR FILE LIST & TEST PRESETS (Fills full bottom section of Chassis) */}
          <div className="mt-4 pt-3 border-t border-zinc-900/60 bg-zinc-950/40 rounded-xl p-2.5 sm:p-3.5 border border-zinc-850/50 shadow-inner font-mono">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              
              {/* LEFT COLUMN: TAPE TRACKS PLAYLIST (Série de Arquivos) - Spans 7 cols on LG, full on small */}
              <div className="lg:col-span-7 space-y-2.5">
                <div className="border-b border-zinc-900 pb-1.5 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#bef264] flex items-center gap-1.5 uppercase">
                    <Activity className="w-3.5 h-3.5 text-lime-400 led-blink-green" />
                    SÉRIE DE ARQUIVOS ({midis.length})
                  </h3>
                  
                  {midis.length > 0 && (
                    <button
                      onClick={() => {
                        playSystemSound(300, 0.2, "sawtooth");
                        setMidis([]); 
                        setSuccessMessage(null); 
                        setError(null);
                      }}
                      className="text-[8.5px] font-bold text-red-400 bg-red-950/20 border border-red-900/30 px-2 py-0.5 rounded cursor-pointer hover:bg-red-950/40 hover:text-red-300 transition-all uppercase"
                    >
                      Zerar Rack
                    </button>
                  )}
                </div>

                {/* Exception logs directly in track database panel */}
                {error && (
                  <div className="bg-red-950/30 border border-red-900/40 text-red-300 p-2 rounded-lg text-[9.5px] flex items-start gap-1.5 leading-relaxed animate-fade-in uppercase">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-404 shrink-0 mt-0.5" />
                    <div>
                      <strong className="block mb-0.5">ALERTA DIAGNÓSTICO:</strong>
                      <span>{error}</span>
                    </div>
                  </div>
                )}

                {successMessage && (
                  <div className="bg-emerald-950/30 border border-emerald-900/40 text-emerald-300 p-2 rounded-lg text-[9.5px] flex items-start gap-1.5 leading-relaxed animate-fade-in uppercase">
                    <CheckCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                    <div>{successMessage}</div>
                  </div>
                )}

                {/* Combined list stream */}
                <div className="space-y-1 max-h-52 lg:max-h-[34rem] 2xl:max-h-[44rem] overflow-y-auto pr-1 console-scrollbar">
                  {filteredMidis.length > 0 ? (
                    filteredMidis.map((item, index) => {
                      const globalIndex = midis.findIndex(m => m.id === item.id);
                      return (
                        <div key={item.id} className="space-y-1">
                          <div
                            className="flex items-center justify-between p-1.5 pl-2 bg-zinc-900/65 border border-zinc-850 rounded-lg hover:border-lime-500/30 transition-all group shadow-sm"
                          >
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="w-3.5 h-3.5 rounded-full bg-zinc-950 text-[#bef264] border border-zinc-850 flex items-center justify-center text-[8px] font-mono font-bold">
                                {globalIndex + 1}
                              </span>
                              <div className="min-w-0">
                                <p className="font-bold text-[11px] text-zinc-100 truncate group-hover:text-[#bef264] transition-colors">
                                  {item.name}
                                </p>
                                <div className="flex items-center gap-1.5 text-[8px] text-zinc-500 uppercase">
                                  <span>{formatBytes(item.size)}</span>
                                  <span>•</span>
                                  <span className="text-lime-500/80 font-semibold">{item.midiFile.tracks.length} canais</span>
                                  <span>•</span>
                                  <span className="text-zinc-400">SERÁ INTEGRADO EM FILA</span>
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center gap-0.5">
                              <button
                                onClick={() => moveItem(globalIndex, "up")}
                                disabled={globalIndex === 0}
                                className="p-0.5 bg-zinc-950 hover:bg-zinc-850 text-zinc-400 disabled:opacity-20 border border-zinc-850 rounded cursor-pointer text-[10px]"
                                title="Subir na Sequência de Fusão"
                              >
                                <ChevronUp className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => moveItem(globalIndex, "down")}
                                disabled={globalIndex === midis.length - 1}
                                className="p-0.5 bg-zinc-950 hover:bg-zinc-850 text-zinc-400 disabled:opacity-20 border border-zinc-850 rounded cursor-pointer text-[10px]"
                                title="Descer na Sequência de Fusão"
                              >
                                <ChevronDown className="w-3 h-3" />
                              </button>
                              <button
                                onClick={() => removeItem(item.id)}
                                className="p-0.5 bg-zinc-950 hover:bg-red-950/40 text-zinc-550 hover:text-red-400 border border-zinc-850 rounded cursor-pointer"
                                title="Deletar Sinal"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>

                          {/* Dotted indicator line showing combining link with next file in list */}
                          {index < filteredMidis.length - 1 && (
                            <div className="flex justify-center -my-1.5 h-2 relative z-10 pointer-events-none">
                              <div className="w-0.5 border-l border-dashed border-lime-400/40 h-full animate-pulse"></div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : searchText !== "" ? (
                    <div className="border border-dashed border-zinc-850 rounded-lg p-3 text-center text-zinc-650 text-[11px] uppercase">
                      NENHUM SINAL MIDI COINCIDE COM SUA BUSCA.
                    </div>
                  ) : (
                    <div className="border border-dashed border-zinc-850/60 rounded-lg p-3 text-center text-zinc-650 text-[11px] leading-relaxed uppercase">
                      ⚙️ CONSOLE VAZIO.<br />
                      Mantenha arquivos arrastados no radar. Eles tocarão sequencialmente.
                    </div>
                  )}
                </div>

                {midis.length === 1 && (
                  <div className="mt-2 bg-zinc-900/40 border border-zinc-850 p-2 rounded-lg text-center text-[9px] text-lime-400 leading-normal uppercase">
                    ⚡ INSIRA MAIS <strong>1 MIDIs</strong> NO RADAR PARA LIBERAR A OPERAÇÃO "JUNTAR MIDI"!
                  </div>
                )}
              </div>

              {/* RIGHT COLUMN: UTILITY CONTROL CENTER (GOOGLE DRIVE & SIMULATION PRESETS TABS) - Spans 5 cols on LG */}
              <div className="lg:col-span-5 flex flex-col justify-between border-t lg:border-t-0 lg:border-l border-zinc-900 pt-3 lg:pt-0 lg:pl-3.5 space-y-2.5">
                
                {/* Visual Tab Selectors */}
                <div className="grid grid-cols-2 gap-1 border-b border-zinc-900 pb-2">
                  <button
                    type="button"
                    onClick={() => { playSystemSound(900, 0.05); setActiveRightTab("presets"); }}
                    className={`py-1 text-[8.5px] font-mono font-extrabold uppercase tracking-wider border rounded transition-all cursor-pointer ${
                      activeRightTab === "presets"
                        ? "bg-zinc-900 text-[#bef264] border-lime-500/40 shadow-[0_0_10px_rgba(163,230,53,0.15)]"
                        : "bg-transparent text-zinc-650 border-transparent hover:text-zinc-400"
                    }`}
                  >
                    ⚙️ SINAIS DE TESTE
                  </button>
                  <button
                    type="button"
                    onClick={() => { playSystemSound(940, 0.05); setActiveRightTab("drive"); }}
                    className={`py-1 text-[8.5px] font-mono font-extrabold uppercase tracking-wider border rounded transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeRightTab === "drive"
                        ? "bg-zinc-905 text-blue-400 border-blue-500/40 shadow-[0_0_10px_rgba(59,130,246,0.15)]"
                        : "bg-transparent text-zinc-650 border-transparent hover:text-zinc-400"
                    }`}
                  >
                    <Cloud className="w-3 h-3 text-blue-400" />
                    {driveToken ? "● DRIVE ATIVO" : "☁️ GOOGLE DRIVE"}
                  </button>
                </div>

                {activeRightTab === "presets" ? (
                  /* SIMULATION PRESETS VIEW */
                  <div className="space-y-2 animate-fade-in">
                    <p className="text-[8.5px] text-zinc-500 leading-normal uppercase">
                      Sem arquivos MIDI no dispositivo? Clique nos combos rápidos abaixo para carregar lotes de 2, 4 ou 6 arquivos e testar a sequência de fusão de sinal:
                    </p>

                    <div className="space-y-1">
                      <div className="text-[7.5px] text-zinc-550 uppercase tracking-widest font-extrabold font-mono">● CARREGAMENTO RÁPIDO DE COMBOS COLETIVOS</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoadMultipleDemos(2)}
                          className="px-1 py-1.5 bg-gradient-to-b from-zinc-900 to-zinc-950 hover:from-lime-950/20 hover:to-zinc-950 border border-zinc-800 hover:border-lime-500/50 text-[#bef264] rounded-md text-[9px] font-extrabold flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                          title="Carregar 2 arquivos de teste simultâneos"
                        >
                          <div className="text-[6.5px] text-zinc-550 font-normal">COMBO</div>
                          <span className="tracking-wide">2 ARQS</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadMultipleDemos(4)}
                          className="px-1 py-1.5 bg-gradient-to-b from-zinc-900 to-zinc-950 hover:from-lime-950/30 hover:to-zinc-950 border border-zinc-800 hover:border-lime-500/60 text-[#bef264] rounded-md text-[9px] font-extrabold flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                          title="Carregar 4 arquivos de teste simultâneos"
                        >
                          <div className="text-[6.5px] text-zinc-550 font-normal">COMBO</div>
                          <span className="tracking-wide">4 ARQS</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadMultipleDemos(6)}
                          className="px-1 py-1.2 bg-gradient-to-b from-zinc-900 to-zinc-950 hover:from-lime-950/35 hover:to-zinc-950 border border-zinc-800 hover:border-lime-500/70 text-[#bef264] rounded-md text-[9px] font-extrabold flex flex-col items-center justify-center gap-0.5 cursor-pointer transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.4)]"
                          title="Carregar 6 arquivos de teste simultâneos"
                        >
                          <div className="text-[6.5px] text-zinc-550 font-normal">COMBO</div>
                          <span className="tracking-wide">6 ARQS</span>
                        </button>
                      </div>
                    </div>

                    <div className="border-t border-zinc-900/40 pt-2">
                      <div className="text-[7.5px] text-zinc-550 uppercase tracking-widest font-extrabold mb-1">● TIMBRES UNITÁRIOS AVULSOS</div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleLoadDemo("piano")}
                          className="px-1 py-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 hover:border-zinc-700 text-zinc-300 rounded-md text-[9px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all uppercase"
                        >
                          <Music className="w-2 h-2 text-zinc-500" />
                          Piano
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadDemo("bass")}
                          className="px-1 py-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 hover:border-zinc-700 text-zinc-300 rounded-md text-[9px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all uppercase"
                        >
                          <Music className="w-2 h-2 text-zinc-500" />
                          Baixo
                        </button>
                        <button
                          type="button"
                          onClick={() => handleLoadDemo("synth")}
                          className="px-1 py-1 bg-zinc-900 hover:bg-zinc-850 border border-zinc-850 hover:border-zinc-700 text-zinc-300 rounded-md text-[9px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-all uppercase"
                        >
                          <Music className="w-2 h-2 text-zinc-500" />
                          Synth
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* GOOGLE DRIVE OPERATIONS VIEW */
                  <div className="space-y-2.5 animate-fade-in flex-grow flex flex-col justify-between">
                    {!driveToken ? (
                      /* OFFLINE LOGIN PROMPT SCREEN */
                      <div className="space-y-2">
                        <p className="text-[8.5px] text-zinc-500 leading-normal uppercase">
                          Sincronize seu acervo musical. Faça login com o Google para explorar seus arquivos MIDI na nuvem e importar notas diretamente para fila.
                        </p>
                        
                        <div className="bg-zinc-950/40 border border-zinc-900 p-3 rounded-lg text-center flex flex-col items-center justify-center gap-3">
                          <Cloud className="w-8 h-8 text-zinc-700 animate-pulse" />
                          
                          <button
                            type="button"
                            onClick={handleGoogleLogin}
                            className="w-full py-2 px-3 bg-gradient-to-b from-blue-600/20 to-blue-700/5 hover:from-blue-600/30 hover:to-blue-700/15 text-blue-405 border border-blue-500/40 hover:border-blue-500/70 rounded-md text-[9.5px] font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-all duration-300 shadow-[0_2px_4px_rgba(0,0,0,0.4)] uppercase font-mono tracking-wider text-blue-400"
                          >
                            <CloudUpload className="w-3.5 h-3.5 text-blue-400 animate-bounce" />
                            CONECTAR GOOGLE DRIVE
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* ACTIVE BROWSER CATALOG SCREEN */
                      <div className="space-y-2 flex-grow flex flex-col">
                        {/* Operator Cloud Identity Headers */}
                        <div className="flex items-center justify-between bg-zinc-950/80 border border-zinc-900 px-2 py-1.5 rounded-lg text-[9px]">
                          <div className="flex items-center gap-1.5 min-w-0 text-zinc-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 led-blink-blue shrink-0"></span>
                            <span className="truncate uppercase font-bold text-blue-400">{driveUser?.email || "CONECTADO"}</span>
                          </div>
                          
                          <button
                            type="button"
                            onClick={handleGoogleLogout}
                            className="text-[8px] text-red-405 hover:text-red-300 bg-red-950/20 px-1.5 py-0.5 border border-red-900/30 rounded cursor-pointer uppercase font-mono font-bold tracking-wider text-red-400"
                          >
                            Desconectar
                          </button>
                        </div>

                        {/* Search and sync control panel */}
                        <div className="bg-zinc-950/90 border border-zinc-900 rounded-md p-1 flex items-center gap-1.5 shadow-inner">
                          <span className="text-[7.5px] font-extrabold text-blue-400 uppercase pl-1 shrink-0">Filtro:</span>
                          <input
                            type="text"
                            value={driveSearchText}
                            onChange={(e) => setDriveSearchText(e.target.value)}
                            placeholder="FILTRAR NA NUVEM..."
                            className="bg-transparent text-blue-400 placeholder:text-zinc-800 text-[9px] font-mono focus:outline-none w-full uppercase"
                            maxLength={30}
                          />
                          <button
                            onClick={() => fetchDriveFilesList(driveToken)}
                            disabled={isQueryingDrive}
                            className="p-1 bg-zinc-900 hover:bg-zinc-850 text-blue-400 border border-zinc-850 rounded disabled:opacity-30 cursor-pointer shrink-0"
                            title="Sincronizar Arquivos do Google Drive"
                          >
                            <RefreshCw className={`w-3 h-3 ${isQueryingDrive ? "animate-spin" : ""}`} />
                          </button>
                        </div>

                        {/* Drive Error Logging */}
                        {driveError && (
                          <div className="bg-red-950/20 border border-red-900/30 text-red-400 p-2 rounded text-[8px] uppercase">
                            ⚠️ erro na nuvem: {driveError}
                          </div>
                        )}

                        {/* Scrollable listing stream */}
                        <div className="space-y-1 max-h-40 lg:max-h-[34rem] 2xl:max-h-[44rem] overflow-y-auto pr-1 console-scrollbar flex-grow">
                          {isQueryingDrive ? (
                            <div className="border border-dashed border-zinc-900 rounded-lg p-3 text-center text-zinc-650 text-[9px] uppercase leading-snug">
                              <RefreshCw className="w-4 h-4 text-blue-400 animate-spin mx-auto mb-1" />
                              ESCANEANDO ACERVO REMOTO DO DRIVE...
                            </div>
                          ) : (
                            (() => {
                              const filtered = driveFiles.filter(f =>
                                f.name.toLowerCase().includes(driveSearchText.toLowerCase())
                              );
                              
                              if (filtered.length === 0) {
                                return (
                                  <div className="border border-dashed border-zinc-900 rounded-lg p-3 text-center text-zinc-650 text-[9px] uppercase leading-relaxed font-mono">
                                    Nenhum arquivo .mid ou .midi localizado em seu drive{driveSearchText && " com o filtro ativo"}.
                                  </div>
                                );
                              }
                              
                              return filtered.map(file => {
                                const isImporting = isImportingFileId === file.id;
                                return (
                                  <div
                                    key={file.id}
                                    className="flex items-center justify-between p-1.5 bg-zinc-900/45 border border-zinc-900 rounded hover:border-blue-500/30 transition-all font-mono"
                                  >
                                    <div className="min-w-0 flex-grow mr-2">
                                      <p className="font-bold text-[9.5px] text-zinc-200 truncate" title={file.name}>
                                        {file.name}
                                      </p>
                                      <p className="text-[7.5px] text-zinc-600 mt-0.5 uppercase">
                                        Criado: {file.createdTime ? new Date(file.createdTime).toLocaleDateString() : 'N/D'}
                                      </p>
                                    </div>
                                    
                                    <button
                                      type="button"
                                      disabled={isImporting}
                                      onClick={() => handleImportDriveFile(file)}
                                      className="py-1 px-2 shrink-0 bg-blue-950/20 border border-blue-900/50 hover:bg-blue-900/30 text-blue-400 text-[8px] font-bold rounded hover:text-blue-300 disabled:opacity-40 transition-all cursor-pointer uppercase flex items-center gap-1 font-mono tracking-wider"
                                    >
                                      {isImporting ? (
                                        <>
                                          <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-400" />
                                          CARREGANDO
                                        </>
                                      ) : (
                                        <>
                                          <CloudDownload className="w-2.5 h-2.5" />
                                          IMPORTAR
                                        </>
                                      )}
                                    </button>
                                  </div>
                                );
                              });
                            })()
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-black/30 border border-zinc-900 rounded-lg p-1.5 text-[8px] text-zinc-600 uppercase leading-snug">
                  Módulo de barramento de sinal. Todos os arquivos adicionados aparecem no radar de ondas e são combinados após pressionar o botão central "Juntar MIDI".
                </div>
              </div>

            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

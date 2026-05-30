import React from "react";
import { Combine, Music, Volume2, HelpCircle } from "lucide-react";
import { MidiMerger } from "./components/MidiMerger";

export default function App() {

  return (
    <div className="min-h-screen bg-[#030404] text-lime-400 flex flex-col font-mono selection:bg-lime-900 selection:text-lime-300">
      
      {/* High-Tech Industrial Header Console */}
      <header className="bg-zinc-950/60 backdrop-blur border-b border-zinc-900 px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 sticky top-0 z-40 shadow-md">
        
        {/* Machine Console Branding */}
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-b from-zinc-800 to-zinc-950 border border-zinc-700/50 rounded-lg flex items-center justify-center font-bold text-lime-400 shadow-md shadow-black/80 font-mono text-sm tracking-widest leading-none">
            M⚙️X
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-[0.16em] uppercase text-zinc-100 flex items-center gap-2">
              MIDI FUSE CONTROL
              <span className="text-[9px] text-[#a3e635] font-extrabold tracking-widest uppercase bg-zinc-900/80 px-1.5 py-0.5 border border-zinc-850 rounded">
                DRS-v3.02
              </span>
            </h1>
            <p className="text-[9.5px] text-zinc-550 uppercase tracking-wide">MESA DE PROCESSAMENTO INDUSTRIAL E CONCATENAÇÃO EM CADEIA</p>
          </div>
        </div>

        {/* Console Health Telemetry */}
        <div className="flex items-center gap-3 self-end sm:self-auto uppercase">
          <div className="flex items-center gap-2 bg-zinc-950 px-3.5 py-1.5 rounded-full border border-zinc-900 shadow-inner">
            <div className="w-2 h-2 rounded-full bg-lime-400 led-blink-green-fast"></div>
            <span className="text-[8.5px] tracking-widest font-extrabold text-lime-400">INTERFACE ATIVA</span>
          </div>
        </div>
      </header>

      {/* Main Workspace Frame */}
      <main className="flex-grow p-3 sm:p-4 md:p-5 w-full max-w-none mx-auto space-y-4">
        
        {/* Main interactive industrial console router */}
        <div className="transition-all duration-300">
          <MidiMerger />
        </div>

      </main>

      {/* Cybernetic Hardware Footer */}
      <footer className="bg-zinc-950 border-t border-zinc-900 py-4 px-6 text-center text-[9px] text-zinc-600 font-mono tracking-widest mt-auto uppercase">
        <p>© 2026 ISU - INDUSTRIAL MUSIC PROCESSING CO.</p>
        <p className="mt-1 text-[8px] text-zinc-700">MESA DE MIXAGEM SEQUENCIAL COM REPRODUÇÃO AUDIO-SYNTH EM TEMPO REAL.</p>
      </footer>
    </div>
  );
}

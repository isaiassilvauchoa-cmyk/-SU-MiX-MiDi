import React, { useRef, useEffect } from "react";

interface AudioVisualizerProps {
  audioElement?: HTMLAudioElement | null;
  mediaStream?: MediaStream | null;
  isPlaying?: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
  audioElement,
  mediaStream,
  isPlaying = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<AudioNode | null>(null);

  useEffect(() => {
    // Limpeza de conexão anterior
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Se não estiver tocando ou não houver sinal, limpa visualizador com um degradê bonito suave
    const drawPlaceholder = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#0a0a0c"; // Bento BG config
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      
      // Linha central estática plana
      ctx.beginPath();
      ctx.moveTo(0, canvas.height / 2);
      ctx.lineTo(canvas.width, canvas.height / 2);
      ctx.strokeStyle = "rgba(99, 102, 241, 0.25)"; // indigo outline
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    if (!isPlaying || (!audioElement && !mediaStream)) {
      drawPlaceholder();
      return;
    }

    try {
      // Cria o contexto de áudio de visualização se necessário
      const AudioCtxClass = window.AudioContext || (window as any).webkitAudioContext;
      const audioCtx = new AudioCtxClass();
      audioContextRef.current = audioCtx;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      const bufferLength = analyser.frequencyBinCount;
      const dataArray = new Uint8Array(bufferLength);

      let sourceNode: AudioNode;

      if (mediaStream) {
        // Fonte do Microfone
        sourceNode = audioCtx.createMediaStreamSource(mediaStream);
        sourceNode.connect(analyser);
      } else if (audioElement) {
        // Fonte da tag Audio (Cross-origin pode silenciar no buffer se não configurado, tratamos com fallback)
        try {
          audioElement.crossOrigin = "anonymous";
          sourceNode = audioCtx.createMediaElementSource(audioElement);
          sourceNode.connect(analyser);
          analyser.connect(audioCtx.destination);
        } catch {
          // Fallback silencioso se o elemento áudio já estiver conectado a outro nó
          drawPlaceholder();
          return;
        }
      } else {
        drawPlaceholder();
        return;
      }

      sourceRef.current = sourceNode;

      // Loop de renderização
      const draw = () => {
        if (!canvasRef.current || !analyserRef.current) return;
        animationRef.current = requestAnimationFrame(draw);

        analyser.getByteFrequencyData(dataArray);

        ctx.fillStyle = "#0a0a0c";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Grade de fundo tipo estúdio técnica sutil
        ctx.strokeStyle = "rgba(99, 102, 241, 0.08)";
        ctx.lineWidth = 0.5;
        for (let i = 20; i < canvas.width; i += 20) {
          ctx.beginPath();
          ctx.moveTo(i, 0);
          ctx.lineTo(i, canvas.height);
          ctx.stroke();
        }
        for (let i = 15; i < canvas.height; i += 15) {
          ctx.beginPath();
          ctx.moveTo(0, i);
          ctx.lineTo(canvas.width, i);
          ctx.stroke();
        }

        const barWidth = (canvas.width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i];

          // Degradê gradiente elegante (indigo a violeta) para espectro de áudio vibrante
          const percent = barHeight / 255;
          const h = percent * canvas.height * 0.8;

          const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - h);
          gradient.addColorStop(0, "rgba(79, 70, 229, 0.45)"); // indigo-600
          gradient.addColorStop(0.5, "rgba(99, 102, 241, 0.75)"); // indigo-500
          gradient.addColorStop(1, "rgba(167, 139, 250, 0.95)"); // violet-400

          ctx.fillStyle = gradient;
          
          // Desenha barras com cantos arredondados simples
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, canvas.height - h, barWidth - 2, h, [4, 4, 0, 0]);
          } else {
            ctx.rect(x, canvas.height - h, barWidth - 2, h);
          }
          ctx.fill();

          x += barWidth;
        }
      };

      draw();
    } catch (err) {
      console.warn("Visualizer initialization failed:", err);
      drawPlaceholder();
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      try {
        if (audioContextRef.current && audioContextRef.current.state !== "closed") {
          audioContextRef.current.close();
        }
      } catch {}
    };
  }, [audioElement, mediaStream, isPlaying]);

  // Redimensionamento automático do canvas para preencher o container
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.parentElement?.getBoundingClientRect();
      if (rect) {
        canvas.width = rect.width;
        canvas.height = 120; // tamanho fixo de visualizador estúdio compacto
      }
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  return (
    <div className="w-full bg-gray-900 border border-gray-800 rounded-lg overflow-hidden relative">
      <canvas ref={canvasRef} className="w-full block" height={120} />
      <div className="absolute top-2 right-3 font-mono text-[9px] tracking-widest text-emerald-400 opacity-60 flex items-center gap-1">
        {isPlaying ? (
          <>
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            ESPECTRO DE SINAL ATIVO
          </>
        ) : (
          "AGUARDANDO SINAL"
        )}
      </div>
    </div>
  );
};

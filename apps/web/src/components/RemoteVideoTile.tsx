import React, { useRef, useEffect } from 'react';
import { Mic, MicOff, Shield } from 'lucide-react';

interface RemoteVideoTileProps {
  socketId: string;
  name: string;
  role?: string;
  isHost?: boolean;
  stream: MediaStream;
  isMuted?: boolean;
  isVideoOff?: boolean;
}

export const RemoteVideoTile: React.FC<RemoteVideoTileProps> = ({
  name,
  role,
  isHost,
  stream,
  isMuted = false,
  isVideoOff = false,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center group">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${isVideoOff ? 'hidden' : ''}`}
      />

      {isVideoOff && (
        <div className="w-20 h-20 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-2xl font-bold text-slate-300 uppercase shadow-inner">
          {name.charAt(0)}
        </div>
      )}

      {/* Participant Name Badge */}
      <div className="absolute bottom-3 left-3 flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-black/60 backdrop-blur-md text-xs font-medium text-white border border-white/10">
        <span className="truncate max-w-[140px]">{name}</span>
        {isHost && (
          <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-1 rounded flex items-center space-x-0.5">
            <Shield className="w-2.5 h-2.5" />
            <span>Host</span>
          </span>
        )}
      </div>

      {/* Mute indicator */}
      <div className="absolute top-3 right-3 p-1.5 rounded-full bg-black/60 backdrop-blur-md border border-white/10">
        {isMuted ? (
          <MicOff className="w-3.5 h-3.5 text-rose-400" />
        ) : (
          <Mic className="w-3.5 h-3.5 text-emerald-400" />
        )}
      </div>
    </div>
  );
};


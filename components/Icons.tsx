
import React from 'react';
import { Protocol } from '../types';
import { Monitor, Globe, Network, Server } from 'lucide-react';

export const ProtocolIcon: React.FC<{ protocol: Protocol; className?: string }> = ({ protocol, className = "w-5 h-5" }) => {
  switch (protocol) {
    case Protocol.RDP:
      // Windows Logo Style
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M0 3.44L10.66 2V11.38H0V3.44ZM11.7 1.88L24 0.16V11.38H11.7V1.88ZM0 12.54H10.66V21.33L0 19.9V12.54ZM11.7 12.54H24V23.16L11.7 21.45V12.54Z" />
        </svg>
      );
    case Protocol.SSH:
      // Terminal Prompt
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className}>
          <polyline points="4 17 10 11 4 5"></polyline>
          <line x1="12" y1="19" x2="20" y2="19"></line>
        </svg>
      );
    case Protocol.TODESK:
      // ToDesk Shield Style
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
           <path d="M12 2L2 7V11C2 16.55 6.84 21.74 12 23C17.16 21.74 22 16.55 22 11V7L12 2ZM12 4.5L19 8V11C19 14.8 16.1 18.4 12 19.5C7.9 18.4 5 14.8 5 11V8L12 4.5Z" />
           <path d="M11 10H13V15H11V10Z" />
           <path d="M8 10H10V12H8V10Z" />
           <path d="M14 10H16V12H14V10Z" />
        </svg>
      );
    case Protocol.SUNLOGIN:
      // Sunlogin (XiangRiKui)
      return (
         <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
            <path d="M12,2A10,10 0 0,1 22,12A10,10 0 0,1 12,22A10,10 0 0,1 2,12A10,10 0 0,1 12,2M12,4A8,8 0 0,0 4,12A8,8 0 0,0 12,20A8,8 0 0,0 20,12A8,8 0 0,0 12,4M12,6A6,6 0 0,1 18,12A6,6 0 0,1 12,18A6,6 0 0,1 6,12A6,6 0 0,1 12,6M12,8A4,4 0 0,0 8,12A4,4 0 0,0 12,16A4,4 0 0,0 16,12A4,4 0 0,0 12,8Z" />
         </svg>
      );
    case Protocol.TEAMVIEWER:
      // TeamViewer Double Arrow
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
          <path d="M12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2ZM16 12H13.5V15.5H10.5V12H8L12 8L16 12Z" />
        </svg>
      );
    case Protocol.ANYDESK:
      // AnyDesk Rhombus
      return (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
           <path d="M12 2L3 11L12 20L21 11L12 2Z" />
        </svg>
      );
    case Protocol.VNC:
      return <Monitor className={className} />;
    case Protocol.HTTPS:
      return <div className="relative flex items-center justify-center"><Globe className={className} /><div className="absolute bottom-0 right-0 w-2 h-2 bg-emerald-500 rounded-full ring-1 ring-slate-900"></div></div>;
    case Protocol.HTTP:
      return <Globe className={className} />;
    case Protocol.VPN:
      return <Network className={className} />;
    default:
      return <Server className={className} />;
  }
};

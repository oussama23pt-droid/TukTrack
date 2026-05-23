interface TukTukLogoProps {
  className?: string;
  variant?: 'full' | 'icon' | 'white';
  size?: number;
}

export const TukTukLogo: React.FC<TukTukLogoProps> = ({ className, size = 32 }) => {
  return (
    <img
      src="/pwa-192x192.png"
      alt="TukTrack"
      width={size}
      height={size}
      className={className}
      style={{ objectFit: 'contain' }}
    />
  );
};

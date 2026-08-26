// Loading State Components
// Provides consistent loading indicators for different UI contexts

import React, { useState } from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'md',
  className = ''
}) => {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-6 h-6',
    lg: 'w-8 h-8'
  };

  return (
    <div className={`animate-spin rounded-full border-2 border-gray-300 border-t-blue-600 ${sizeClasses[size]} ${className}`} />
  );
};

interface LoadingButtonProps {
  loading: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  className?: string;
  loadingText?: string;
  onClick?: () => void;
  type?: 'button' | 'submit' | 'reset';
}

export const LoadingButton: React.FC<LoadingButtonProps> = ({
  loading,
  children,
  disabled = false,
  className = '',
  loadingText = 'Loading...',
  onClick,
  type = 'button'
}) => {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      className={`
        relative inline-flex items-center justify-center px-4 py-2 border border-transparent
        text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700
        focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500
        disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200
        ${className}
      `}
    >
      {loading && (
        <LoadingSpinner size="sm" className="mr-2" />
      )}
      {loading ? loadingText : children}
    </button>
  );
};

interface LoadingCardProps {
  title?: string;
  lines?: number;
  className?: string;
}

export const LoadingCard: React.FC<LoadingCardProps> = ({
  title,
  lines = 3,
  className = ''
}) => {
  // 骨架屏随机宽度挂载时一次生成（v1 在 render 期调 Math.random，违反纯度规则且 StrictMode 下抖动）
  const [widths] = useState(() => Array.from({ length: lines }, () => Math.random() * 40 + 60));
  return (
    <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>
      {title && (
        <div className="h-6 bg-gray-200 rounded mb-4 animate-pulse" />
      )}
      {widths.map((w, index) => (
        <div
          key={index}
          className="h-4 bg-gray-200 rounded mb-2 animate-pulse"
          style={{
            width: `${w}%`
          }}
        />
      ))}
    </div>
  );
};

interface LoadingTableProps {
  rows?: number;
  columns?: number;
  className?: string;
}

export const LoadingTable: React.FC<LoadingTableProps> = ({
  rows = 5,
  columns = 4,
  className = ''
}) => {
  // 骨架屏随机宽度挂载时一次生成（同 LoadingCard：v1 在 render 期调 Math.random 违反纯度）
  const [widths] = useState(() =>
    Array.from({ length: rows }, () => Array.from({ length: columns }, () => Math.random() * 40 + 60)),
  );
  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {Array.from({ length: columns }).map((_, index) => (
                <th
                  key={index}
                  className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  <div className="h-4 bg-gray-200 rounded animate-pulse" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {widths.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((w, colIndex) => (
                  <td key={colIndex} className="px-6 py-4 whitespace-nowrap">
                    <div
                      className="h-4 bg-gray-200 rounded animate-pulse"
                      style={{
                        width: `${w}%`
                      }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

interface FullScreenLoadingProps {
  message?: string;
  showLogo?: boolean;
}

export const FullScreenLoading: React.FC<FullScreenLoadingProps> = ({
  message = 'Loading...',
  showLogo = true
}) => {
  return (
    <div className="fixed inset-0 bg-gray-900 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-8 max-w-sm w-full mx-4 text-center">
        {showLogo && (
          <div className="mb-4">
            <div className="w-16 h-16 bg-blue-600 rounded-lg mx-auto flex items-center justify-center">
              <span className="text-white text-2xl font-bold">RH</span>
            </div>
          </div>
        )}
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-gray-600">{message}</p>
      </div>
    </div>
  );
};

interface PageLoadingProps {
  message?: string;
}

export const PageLoading: React.FC<PageLoadingProps> = ({
  message = 'Loading page...'
}) => {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <LoadingSpinner size="lg" className="mx-auto mb-4" />
        <p className="text-gray-600 text-lg">{message}</p>
      </div>
    </div>
  );
};

interface SkeletonProps {
  children: React.ReactNode;
  loading: boolean;
  fallback?: React.ReactNode;
}

export const Skeleton: React.FC<SkeletonProps> = ({
  children,
  loading,
  fallback
}) => {
  if (loading) {
    return <>{fallback || <LoadingCard />}</>;
  }
  return <>{children}</>;
};

// Progressive loading component for images
interface ProgressiveImageProps {
  src: string;
  alt: string;
  placeholder?: string;
  className?: string;
  onLoad?: () => void;
  onError?: () => void;
}

export const ProgressiveImage: React.FC<ProgressiveImageProps> = ({
  src,
  alt,
  placeholder = '/placeholder.png',
  className = '',
  onLoad,
  onError
}) => {
  const [imageSrc, setImageSrc] = React.useState(placeholder);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    const img = new Image();
    img.src = src;

    img.onload = () => {
      setImageSrc(src);
      setLoading(false);
      onLoad?.();
    };

    img.onerror = () => {
      setLoading(false);
      onError?.();
    };
  }, [src, onLoad, onError]);

  return (
    <div className={`relative ${className}`}>
      <img
        src={imageSrc}
        alt={alt}
        className={`transition-opacity duration-300 ${loading ? 'opacity-50' : 'opacity-100'}`}
      />
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100">
          <LoadingSpinner />
        </div>
      )}
    </div>
  );
};

// Loading overlay for any component
interface LoadingOverlayProps {
  loading: boolean;
  message?: string;
  children: React.ReactNode;
  className?: string;
}

export const LoadingOverlay: React.FC<LoadingOverlayProps> = ({
  loading,
  message = 'Loading...',
  children,
  className = ''
}) => {
  return (
    <div className={`relative ${className}`}>
      {children}
      {loading && (
        <div className="absolute inset-0 bg-white bg-opacity-75 flex items-center justify-center z-10">
          <div className="text-center">
            <LoadingSpinner size="lg" className="mx-auto mb-2" />
            <p className="text-gray-600 text-sm">{message}</p>
          </div>
        </div>
      )}
    </div>
  );
};
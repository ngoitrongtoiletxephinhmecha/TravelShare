import React from 'react';
import { cn, formatVietnamDateTime } from '../../utils/format';
import { useSystemHealth } from '../../hooks/useSystemHealth';
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Database,
  RefreshCw,
  Server,
} from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  className,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  ...props
}) => {
  const variants = {
    primary:
      'bg-emerald-700 text-white hover:bg-emerald-800 shadow-sm active:bg-emerald-900',
    secondary:
      'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200',
    outline:
      'border border-stone-300 bg-white text-stone-700 hover:bg-stone-50',
    ghost: 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
    danger: 'bg-red-600 text-white hover:bg-red-700',
  };

  const sizes = {
    sm: 'px-3 py-1.5 text-xs font-medium rounded-lg',
    md: 'px-4 py-2 text-sm font-medium rounded-xl',
    lg: 'px-5 py-2.5 text-base font-semibold rounded-xl',
  };

  return (
    <button
      disabled={disabled || isLoading}
      className={cn(
        'inline-flex items-center justify-center gap-2 transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {isLoading && <RefreshCw className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

export const Card: React.FC<React.HTMLAttributes<HTMLDivElement>> = ({
  children,
  className,
  ...props
}) => (
  <div
    className={cn(
      'bg-white rounded-2xl border border-stone-200/80 shadow-sm',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export const Badge: React.FC<{
  children: React.ReactNode;
  variant?: 'emerald' | 'amber' | 'stone' | 'slate' | 'demo' | 'red' | 'blue';
  className?: string;
}> = ({ children, variant = 'emerald', className }) => {
  const styles = {
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    amber: 'bg-amber-50 text-amber-800 border-amber-200',
    stone: 'bg-stone-100 text-stone-700 border-stone-200',
    slate: 'bg-slate-100 text-slate-700 border-slate-200',
    demo: 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
    red: 'bg-red-50 text-red-800 border-red-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200',
  };
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium border',
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
};

export const Avatar: React.FC<{
  src?: string;
  alt?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}> = ({ src, alt = 'Thành viên', size = 'md', className }) => {
  const sizeClass =
    size === 'sm'
      ? 'w-8 h-8'
      : size === 'lg'
        ? 'w-12 h-12'
        : 'w-10 h-10';
  const fallbackUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(
    alt,
  )}&background=166534&color=fff`;

  return (
    <img
      src={src || fallbackUrl}
      alt={alt}
      className={cn(
        'rounded-full object-cover border border-emerald-200 shrink-0',
        sizeClass,
        className,
      )}
    />
  );
};

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div
    className={cn('animate-pulse bg-stone-200/80 rounded-xl', className)}
  />
);

export const EmptyState: React.FC<{
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}> = ({ icon, title, description, action }) => (
  <Card className="p-8 text-center">
    <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3">
      {icon}
    </div>
    <h3 className="text-base font-semibold text-stone-900 mb-1">{title}</h3>
    <p className="text-sm text-stone-500 max-w-md mx-auto mb-4">
      {description}
    </p>
    {action}
  </Card>
);

export const SystemStatusWidget: React.FC = () => {
  const { data, isLoading, isError, refetch, isFetching } = useSystemHealth();

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Server className="w-4 h-4 text-emerald-700" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-700">
            API Health Check
          </h3>
        </div>
        <button
          onClick={() => refetch()}
          className="text-xs text-stone-500 hover:text-emerald-700 inline-flex items-center gap-1"
          title="Kiểm tra lại kết nối Backend"
        >
          <RefreshCw
            className={cn('w-3.5 h-3.5', isFetching && 'animate-spin')}
          />
          Làm mới
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ) : isError || !data ? (
        <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-1">
          <div className="flex items-center gap-1.5 font-semibold">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Chưa kết nối tới Backend API (:4000)</span>
          </div>
          <p className="text-amber-700 leading-relaxed">
            Chạy <code className="font-mono bg-amber-100 px-1 rounded">npm run dev:backend</code> để kích hoạt REST API & MongoDB.
          </p>
        </div>
      ) : (
        <div className="space-y-2 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-stone-100">
            <span className="text-stone-500 flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-600" />
              REST API (/api/v1)
            </span>
            <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {data.status}
            </span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-stone-100">
            <span className="text-stone-500 flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              MongoDB
            </span>
            <span className="font-medium text-stone-800">
              {data.database.status}
            </span>
          </div>
          <div className="flex items-center justify-between py-1 border-b border-stone-100">
            <span className="text-stone-500">Múi giờ / Tiền tệ</span>
            <span className="font-medium text-stone-800">
              {data.timezone} • {data.currency}
            </span>
          </div>
          <div className="text-[11px] text-stone-400 pt-1">
            Đồng bộ lúc: {formatVietnamDateTime(data.serverTime)}
          </div>
        </div>
      )}
    </Card>
  );
};

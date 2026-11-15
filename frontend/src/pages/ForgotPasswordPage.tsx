import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Mail, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button, Card } from '../components/ui/DesignSystem';
import { authService } from '../services/auth.service';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [step, setStep] = useState<'request' | 'reset' | 'done'>('request');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleRequestReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authService.forgotPassword(email);
      setMessage(res.message);
      if (res.devResetTokenPreview) {
        setResetToken(res.devResetTokenPreview);
      }
      setStep('reset');
    } catch (err: any) {
      setError(
        err.response?.data?.message || 'Không thể gửi yêu cầu đặt lại mật khẩu',
      );
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await authService.resetPassword({
        email,
        resetToken,
        newPassword,
      });
      setMessage(res.message);
      setStep('done');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Đặt lại mật khẩu thất bại';
      setError(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-8">
      <Card className="p-6 sm:p-8">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mx-auto mb-3">
            <KeyRound className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-stone-900">
            Khôi phục mật khẩu
          </h1>
          <p className="text-xs text-stone-500 mt-1">
            Nhập email đã đăng ký để nhận mã đặt lại mật khẩu
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {message && (
          <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{message}</span>
          </div>
        )}

        {step === 'request' && (
          <form onSubmit={handleRequestReset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Email tài khoản
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-stone-400 absolute left-3.5 top-3" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ban@travelshare.vn"
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-stone-300 focus:border-emerald-600 focus:outline-none"
                />
              </div>
            </div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={loading}
            >
              Gửi yêu cầu khôi phục
            </Button>
          </form>
        )}

        {step === 'reset' && (
          <form onSubmit={handleConfirmReset} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Mã xác thực khôi phục (Reset Token)
              </label>
              <input
                type="text"
                required
                value={resetToken}
                onChange={(e) => setResetToken(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300 font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1.5">
                Mật khẩu mới
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Ít nhất 8 ký tự (Hoa, thường, số)"
                className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-stone-300"
              />
            </div>
            <Button
              type="submit"
              variant="primary"
              className="w-full"
              isLoading={loading}
            >
              Xác nhận đổi mật khẩu mới
            </Button>
          </form>
        )}

        {step === 'done' && (
          <Link to="/login">
            <Button variant="primary" className="w-full">
              Quay lại trang Đăng nhập
            </Button>
          </Link>
        )}

        <div className="mt-5 text-center">
          <Link
            to="/login"
            className="text-xs font-medium text-stone-500 hover:text-emerald-700"
          >
            ← Quay lại đăng nhập
          </Link>
        </div>
      </Card>
    </div>
  );
};

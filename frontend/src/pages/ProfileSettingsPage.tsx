import React, { useState } from 'react';
import { Navigate } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Shield,
  UserCheck,
  Lock,
} from 'lucide-react';
import { Button, Card } from '../components/ui/DesignSystem';
import { useAuthStore } from '../store/auth.store';
import { authService } from '../services/auth.service';
import { ExperienceLevel } from '../types';

export const ProfileSettingsPage: React.FC = () => {
  const { user, isAuthenticated, updateUserProfile, clearAuth } =
    useAuthStore();

  const [fullName, setFullName] = useState(user?.profile?.fullName || '');
  const [bio, setBio] = useState(user?.profile?.bio || '');
  const [city, setCity] = useState(user?.profile?.city || 'Hà Nội, Việt Nam');
  const [avatarUrl, setAvatarUrl] = useState(user?.profile?.avatarUrl || '');
  const [coverUrl, setCoverUrl] = useState(user?.profile?.coverUrl || '');
  const [experienceLevel, setExperienceLevel] = useState<ExperienceLevel>(
    user?.profile?.experienceLevel || 'BEGINNER',
  );

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setErrorMsg(null);
    setSaving(true);
    try {
      const updated = await authService.updateProfile({
        fullName,
        bio,
        city,
        avatarUrl,
        coverUrl,
        experienceLevel,
      });
      updateUserProfile(updated);
      setStatusMsg('Đã cập nhật hồ sơ cá nhân thành công!');
    } catch (err: any) {
      setErrorMsg(
        err.response?.data?.message || 'Cập nhật hồ sơ không thành công',
      );
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);
    setErrorMsg(null);
    setSaving(true);
    try {
      const res = await authService.changePassword({
        currentPassword,
        newPassword,
      });
      setStatusMsg(res.message);
      setCurrentPassword('');
      setNewPassword('');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Đổi mật khẩu thất bại';
      setErrorMsg(Array.isArray(msg) ? msg.join(', ') : msg);
    } finally {
      setSaving(false);
    }
  };

  const handleRevokeAll = async () => {
    await authService.revokeAllSessions();
    clearAuth();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-stone-900">
          Quản lý hồ sơ & Bảo mật tài khoản
        </h1>
        <p className="text-xs text-stone-500">
          Cập nhật thông tin cá nhân, ảnh đại diện, kinh nghiệm du lịch và phiên
          đăng nhập
        </p>
      </div>

      {statusMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{statusMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100">
          <UserCheck className="w-4 h-4 text-emerald-700" />
          <h2 className="text-sm font-bold text-stone-900">
            Thông tin hồ sơ công khai
          </h2>
        </div>

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Họ và tên
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Thành phố / Khu vực giao nhận
              </label>
              <input
                type="text"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                URL Ảnh đại diện (Avatar)
              </label>
              <input
                type="url"
                value={avatarUrl}
                onChange={(e) => setAvatarUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Kinh nghiệm Outdoor / Trekking
              </label>
              <select
                value={experienceLevel}
                onChange={(e) =>
                  setExperienceLevel(e.target.value as ExperienceLevel)
                }
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300 bg-white"
              >
                <option value="BEGINNER">Người mới (Beginner)</option>
                <option value="INTERMEDIATE">Đã có kinh nghiệm (Intermediate)</option>
                <option value="ADVANCED">Chuyên nghiệp / Dẫn đoàn (Advanced)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              URL Ảnh bìa (Cover)
            </label>
            <input
              type="url"
              value={coverUrl}
              onChange={(e) => setCoverUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-stone-700 mb-1">
              Giới thiệu bản thân (Bio)
            </label>
            <textarea
              rows={3}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
            />
          </div>

          <div className="flex justify-end">
            <Button type="submit" variant="primary" isLoading={saving}>
              Lưu thay đổi hồ sơ
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4 pb-3 border-b border-stone-100">
          <Lock className="w-4 h-4 text-emerald-700" />
          <h2 className="text-sm font-bold text-stone-900">Đổi mật khẩu</h2>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Mật khẩu hiện tại
              </label>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-stone-700 mb-1">
                Mật khẩu mới
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-stone-300"
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" variant="outline" isLoading={saving}>
              Cập nhật mật khẩu
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6 border-red-200">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-stone-900">
              <Shield className="w-4 h-4 text-red-600" />
              <span>Quản lý phiên đăng nhập (Refresh Token Rotation)</span>
            </div>
            <p className="text-xs text-stone-500 mt-1">
              Đăng xuất và thu hồi toàn bộ refresh token đang hoạt động trên mọi
              thiết bị.
            </p>
          </div>
          <Button variant="danger" size="sm" onClick={handleRevokeAll}>
            Thu hồi mọi phiên
          </Button>
        </div>
      </Card>
    </div>
  );
};

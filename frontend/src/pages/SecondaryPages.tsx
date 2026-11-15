import React from 'react';
import {
  Compass,
  Filter,
  MapPin,
  ShieldCheck,
  Sparkles,
  Tent,
  Users,
} from 'lucide-react';
import { Badge, Button, Card } from '../components/ui/DesignSystem';
import { formatVnd } from '../utils/format';

const GEAR_CATEGORIES = [
  'Lều trại',
  'Balo',
  'Túi ngủ',
  'Giày trekking',
  'Gậy trekking',
  'Đèn pin & đèn đội đầu',
  'Bếp dã ngoại',
  'Bàn ghế camping',
  'Máy ảnh',
  'Phụ kiện du lịch',
];

export const GearMarketplacePage: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-stone-900">
            Gear Sharing Marketplace
          </h1>
          <p className="text-xs text-stone-500">
            Thuê, cho thuê hoặc mượn miễn phí thiết bị trekking & camping từ
            cộng đồng
          </p>
        </div>
        <Button variant="primary" size="md">
          <Tent className="w-4 h-4" />
          Đăng thiết bị của bạn
        </Button>
      </div>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <Badge variant="emerald" className="px-3 py-1.5 cursor-pointer shrink-0">
          <Filter className="w-3.5 h-3.5" />
          Tất cả danh mục (10)
        </Badge>
        {GEAR_CATEGORIES.map((cat) => (
          <Badge
            key={cat}
            variant="stone"
            className="px-3 py-1.5 cursor-pointer shrink-0 hover:bg-emerald-50 hover:text-emerald-800"
          >
            {cat}
          </Badge>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {[
          {
            title: 'Lều Naturehike Cloud Up 2 (2 người, chống mưa PU4000mm)',
            category: 'Lều trại',
            price: 80000,
            deposit: 500000,
            district: 'Cầu Giấy, Hà Nội',
            condition: 'LIKE_NEW',
            owner: 'Trần Minh Quân',
            image:
              'https://images.unsplash.com/photo-1504280390367-361c6d9f38f4?w=600&auto=format&fit=crop&q=80',
          },
          {
            title: 'Cặp gậy Trekking Carbon Naturehike khóa bật nhanh',
            category: 'Gậy trekking',
            price: 35000,
            deposit: 200000,
            district: 'Đống Đa, Hà Nội',
            condition: 'GOOD',
            owner: 'Lê Hoàng Nam',
            image:
              'https://images.unsplash.com/photo-1551632811-561732d1e306?w=600&auto=format&fit=crop&q=80',
          },
          {
            title: 'Đèn đội đầu Black Diamond Spot 400 Lumens chống nước IPX8',
            category: 'Đèn pin & đèn đội đầu',
            price: 0,
            deposit: 150000,
            district: 'Thanh Xuân, Hà Nội',
            condition: 'GOOD',
            owner: 'Nguyễn Thảo Vy',
            image:
              'https://images.unsplash.com/photo-1510312305653-8ed496efae75?w=600&auto=format&fit=crop&q=80',
          },
        ].map((item) => (
          <Card key={item.title} className="overflow-hidden flex flex-col">
            <div className="aspect-[16/10] bg-stone-100 relative">
              <img
                src={item.image}
                alt={item.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 left-3 flex gap-1.5">
                <Badge variant="demo">DEMO</Badge>
                <Badge variant="emerald">{item.category}</Badge>
              </div>
            </div>
            <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
              <div>
                <h3 className="text-sm font-bold text-stone-900 line-clamp-2">
                  {item.title}
                </h3>
                <p className="text-xs text-stone-500 mt-1 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5 text-emerald-700" />
                  Khu vực gần đúng: {item.district}
                </p>
              </div>
              <div className="pt-3 border-t border-stone-100 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-800">
                    {formatVnd(item.price)}
                    {item.price > 0 && (
                      <span className="text-xs font-normal text-stone-500">
                        /ngày
                      </span>
                    )}
                  </p>
                  <p className="text-[11px] text-stone-400">
                    Cọc dự kiến: {formatVnd(item.deposit)}
                  </p>
                </div>
                <Button size="sm" variant="secondary">
                  Xem chi tiết
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};

export const AiAssistantPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <Card className="p-6 bg-emerald-900 text-white">
        <div className="flex items-center gap-2.5 mb-2">
          <Sparkles className="w-5 h-5 text-emerald-300" />
          <h1 className="text-lg font-bold">
            AI Travel Assistant — Tư vấn Chuyến Đi & Gợi ý Thiết Bị
          </h1>
        </div>
        <p className="text-xs text-emerald-100 leading-relaxed">
          Nhập mô tả chuyến đi của bạn để AI trích xuất yêu cầu (Structured
          Outputs), tạo Checklist cá nhân hóa và đối chiếu thiết bị thực tế trên
          TravelShare.
        </p>
      </Card>

      <Card className="p-6 space-y-4">
        <div className="p-4 rounded-2xl bg-stone-100 text-sm text-stone-800">
          <span className="text-xs font-bold uppercase text-emerald-800 block mb-1">
            Ví dụ câu hỏi người dùng:
          </span>
          “Tôi muốn trekking Yên Tử ngày 15/11, đi một ngày, nhóm ba người, tôi
          chưa có kinh nghiệm, đã có balo và áo khoác. Tôi muốn thuê những thiết
          bị còn thiếu trong ngân sách 300.000 đồng.”
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 rounded-xl border border-stone-200 bg-stone-50">
            <h3 className="text-xs font-bold uppercase text-stone-700 mb-2">
              Structured Requirement Parser Schema
            </h3>
            <pre className="text-xs font-mono text-emerald-900 overflow-x-auto">
{`{
  "intent": "PREPARE_TRIP",
  "destination": "Yên Tử",
  "activity": "TREKKING",
  "departureDate": "2026-11-15",
  "durationDays": 1,
  "travelers": 3,
  "experienceLevel": "BEGINNER",
  "budget": 300000,
  "ownedGear": ["BACKPACK", "JACKET"],
  "missingFields": []
}`}
            </pre>
          </div>
          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-2">
            <h3 className="text-xs font-bold uppercase text-emerald-900">
              Trạng thái Module AI (Phase 6 & 7)
            </h3>
            <p className="text-xs text-stone-700 leading-relaxed">
              Database schemas (<code className="font-mono">ai_conversations</code>,{' '}
              <code className="font-mono">ai_messages</code>,{' '}
              <code className="font-mono">travel_plans</code>,{' '}
              <code className="font-mono">checklists</code>,{' '}
              <code className="font-mono">gear_rules</code>) đã được khởi tạo
              trong Phase 1 và sẵn sàng tích hợp Gemini API.
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
};

export const ExplorePage: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center gap-2">
      <Compass className="w-5 h-5 text-emerald-700" />
      <h1 className="text-xl font-bold text-stone-900">
        Khám phá Cung Đường & Hashtag Nổi Bật
      </h1>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      {[
        { tag: '#TrekkingYenTu', posts: '42 bài viết', activity: 'TREKKING' },
        { tag: '#SanMayLaoThan', posts: '86 bài viết', activity: 'TREKKING' },
        { tag: '#CampingHoDongDo', posts: '64 bài viết', activity: 'CAMPING' },
      ].map((item) => (
        <Card key={item.tag} className="p-4">
          <Badge variant="emerald">{item.activity}</Badge>
          <p className="text-base font-bold text-stone-900 mt-2">{item.tag}</p>
          <p className="text-xs text-stone-500">{item.posts}</p>
        </Card>
      ))}
    </div>
  </div>
);

export const CommunitiesPage: React.FC = () => (
  <div className="space-y-4">
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <Users className="w-5 h-5 text-emerald-700" />
        <h1 className="text-xl font-bold text-stone-900">
          Cộng đồng Du lịch & Chia sẻ Đồ Phượt
        </h1>
      </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {[
        {
          name: 'Trekking Việt Nam',
          members: 1420,
          desc: 'Chia sẻ kinh nghiệm chinh phục Yên Tử, Lảo Thẩn, Tà Xùa, Bạch Mộc Lương Tử.',
        },
        {
          name: 'Camping Việt Nam',
          members: 980,
          desc: 'Địa điểm cắm trại cuối tuần, kinh nghiệm dựng lều và cho mượn đồ dã ngoại.',
        },
      ].map((c) => (
        <Card key={c.name} className="p-5 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-stone-900">{c.name}</h3>
              <Badge variant="demo">DEMO</Badge>
            </div>
            <p className="text-xs text-stone-500 mt-1">{c.desc}</p>
            <p className="text-xs font-semibold text-emerald-700 mt-2 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" />
              {c.members.toLocaleString('vi-VN')} thành viên
            </p>
          </div>
          <Button size="sm" variant="outline">
            Tham gia
          </Button>
        </Card>
      ))}
    </div>
  </div>
);

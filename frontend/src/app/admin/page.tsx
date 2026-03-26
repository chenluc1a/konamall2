'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import {
  Users, ShoppingBag, CreditCard, Package,
  TrendingUp, AlertCircle, ArrowRight, CheckCircle2,
  Clock, XCircle, Truck,
} from 'lucide-react';

interface Stats {
  users_total: number;
  orders_total: number;
  orders_paid: number;
  orders_today: number;
  products_total: number;
  products_active: number;
  revenue_total: number;
  revenue_this_month: number;
  daily_revenue: { date: string; revenue: number }[];
  status_counts: Record<string, number>;
}

const STATUS_LABEL: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  pending:    { label: '결제대기', color: 'text-yellow-600 bg-yellow-50', icon: Clock },
  paid:       { label: '결제완료', color: 'text-blue-600 bg-blue-50', icon: CheckCircle2 },
  processing: { label: '처리중',   color: 'text-purple-600 bg-purple-50', icon: Package },
  shipped:    { label: '배송중',   color: 'text-cyan-600 bg-cyan-50', icon: Truck },
  delivered:  { label: '배송완료', color: 'text-green-600 bg-green-50', icon: CheckCircle2 },
  cancelled:  { label: '취소',     color: 'text-red-600 bg-red-50', icon: XCircle },
  refunded:   { label: '환불',     color: 'text-gray-600 bg-gray-50', icon: XCircle },
};

const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/api/admin/stats')
      .then((r) => setStats(r.data))
      .catch((e) => setError(e.response?.data?.detail || '통계를 불러올 수 없습니다.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-4 animate-pulse">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 bg-white rounded-xl shadow-sm" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
        <AlertCircle className="w-5 h-5 shrink-0" />
        {error}
      </div>
    );
  }

  const maxRevenue = Math.max(...(stats?.daily_revenue.map(d => d.revenue) || [1]), 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">대시보드</h1>
        <span className="text-sm text-gray-400">실시간 데이터</span>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: '전체 회원',
            value: fmt(stats?.users_total ?? 0),
            sub: '명',
            icon: Users,
            color: 'from-blue-500 to-blue-600',
            href: '/admin/users',
          },
          {
            label: '이번달 매출',
            value: fmt(stats?.revenue_this_month ?? 0),
            sub: '원',
            icon: TrendingUp,
            color: 'from-green-500 to-emerald-600',
            href: '/admin/orders',
          },
          {
            label: '오늘 주문',
            value: fmt(stats?.orders_today ?? 0),
            sub: '건',
            icon: ShoppingBag,
            color: 'from-purple-500 to-violet-600',
            href: '/admin/orders',
          },
          {
            label: '활성 상품',
            value: fmt(stats?.products_active ?? 0),
            sub: `/ ${fmt(stats?.products_total ?? 0)}`,
            icon: Package,
            color: 'from-orange-500 to-amber-500',
            href: '/admin/products',
          },
        ].map(({ label, value, sub, icon: Icon, color, href }) => (
          <Link
            key={label}
            href={href}
            className="bg-white rounded-xl shadow-sm p-5 flex items-center gap-4 hover:shadow-md transition-shadow group"
          >
            <div className={`bg-gradient-to-br ${color} text-white p-3 rounded-xl shrink-0`}>
              <Icon className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-500 mb-0.5">{label}</p>
              <p className="text-xl font-bold text-gray-800 truncate">
                {value}<span className="text-sm font-normal text-gray-500 ml-1">{sub}</span>
              </p>
            </div>
          </Link>
        ))}
      </div>

      {/* 매출 그래프 + 주문 상태 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* 7일 매출 바 차트 */}
        <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-800">최근 7일 매출</h2>
            <span className="text-sm text-gray-400">총 {fmt(stats?.revenue_total ?? 0)}원</span>
          </div>
          <div className="flex items-end gap-2 h-36">
            {(stats?.daily_revenue ?? []).map((d) => (
              <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] text-gray-400">
                  {d.revenue > 0 ? `${Math.round(d.revenue / 10000)}만` : ''}
                </span>
                <div
                  className="w-full bg-gradient-to-t from-primary-500 to-primary-400 rounded-t-md transition-all duration-500"
                  style={{ height: `${Math.max((d.revenue / maxRevenue) * 100, 2)}%` }}
                />
                <span className="text-[10px] text-gray-500">{d.date}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 주문 상태 분포 */}
        <div className="bg-white rounded-xl shadow-sm p-5">
          <h2 className="font-semibold text-gray-800 mb-4">주문 상태</h2>
          <div className="space-y-2">
            {Object.entries(stats?.status_counts ?? {}).map(([st, cnt]) => {
              const info = STATUS_LABEL[st] ?? { label: st, color: 'text-gray-600 bg-gray-50', icon: Package };
              const Icon = info.icon;
              return (
                <div key={st} className="flex items-center justify-between">
                  <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-1 rounded-full ${info.color}`}>
                    <Icon className="w-3 h-3" />
                    {info.label}
                  </span>
                  <span className="text-sm font-semibold text-gray-700">{cnt}건</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 빠른 링크 */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { href: '/admin/orders?status=paid', label: '미처리 결제완료 주문 확인', color: 'border-blue-200 text-blue-700 hover:bg-blue-50' },
          { href: '/admin/products?untranslated=true', label: '미번역 상품 번역하기', color: 'border-purple-200 text-purple-700 hover:bg-purple-50' },
          { href: '/admin/users', label: '신규 회원 목록 보기', color: 'border-green-200 text-green-700 hover:bg-green-50' },
        ].map(({ href, label, color }) => (
          <Link
            key={label}
            href={href}
            className={`flex items-center justify-between px-4 py-3 bg-white border ${color} rounded-xl text-sm font-medium transition-colors`}
          >
            {label}
            <ArrowRight className="w-4 h-4 shrink-0" />
          </Link>
        ))}
      </div>
    </div>
  );
}

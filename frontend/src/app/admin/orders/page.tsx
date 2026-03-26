'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { ShoppingBag, RefreshCw, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import toast from 'react-hot-toast';

interface OrderRow {
  id: number;
  order_number: string;
  status: string;
  payment_status: string;
  total_amount: number;
  items_count: number;
  created_at: string | null;
}

const STATUS_OPTIONS = [
  { value: '', label: '전체' },
  { value: 'pending',    label: '결제대기' },
  { value: 'paid',       label: '결제완료' },
  { value: 'processing', label: '처리중' },
  { value: 'shipped',    label: '배송중' },
  { value: 'delivered',  label: '배송완료' },
  { value: 'cancelled',  label: '취소' },
  { value: 'refunded',   label: '환불' },
];

const STATUS_STYLE: Record<string, string> = {
  pending:    'bg-yellow-100 text-yellow-700',
  paid:       'bg-blue-100 text-blue-700',
  processing: 'bg-purple-100 text-purple-700',
  shipped:    'bg-cyan-100 text-cyan-700',
  delivered:  'bg-green-100 text-green-700',
  cancelled:  'bg-red-100 text-red-700',
  refunded:   'bg-gray-100 text-gray-600',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '결제대기', paid: '결제완료', processing: '처리중',
  shipped: '배송중', delivered: '배송완료', cancelled: '취소', refunded: '환불',
};

const fmt = (n: number) => new Intl.NumberFormat('ko-KR').format(n);
const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-';

export default function AdminOrdersPage() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [search, setSearch] = useState('');
  const [updating, setUpdating] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/admin/orders', {
      params: { page, limit: 20, status: statusFilter || undefined, search: search || undefined },
    })
      .then((r) => setOrders(r.data))
      .catch((e) => toast.error(e.response?.data?.detail || '불러오기 실패'))
      .finally(() => setLoading(false));
  }, [page, statusFilter, search]);

  useEffect(() => { load(); }, [load]);

  const handleStatusChange = async (orderId: number, newStatus: string) => {
    setUpdating(orderId);
    try {
      await api.patch(`/api/admin/orders/${orderId}/status`, { status: newStatus });
      toast.success('주문 상태가 변경되었습니다.');
      setOrders((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: newStatus } : o))
      );
    } catch (e: any) {
      toast.error(e.response?.data?.detail || '상태 변경 실패');
    } finally {
      setUpdating(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <ShoppingBag className="w-7 h-7 text-primary-500" />
          주문 관리
        </h1>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex flex-wrap gap-3">
        {/* 상태 필터 탭 */}
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { setStatusFilter(opt.value); setPage(1); }}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                statusFilter === opt.value
                  ? 'bg-slate-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {/* 검색 */}
        <div className="flex items-center gap-2 ml-auto border rounded-lg px-3 py-1.5 focus-within:ring-2 focus-within:ring-primary-500">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            className="text-sm outline-none w-40"
            placeholder="주문번호 검색"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && load()}
          />
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" />
            불러오는 중...
          </div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center text-gray-400">주문이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['주문번호', '주문상태', '결제', '금액', '품목', '주문일시', '상태변경'].map((h) => (
                    <th key={h} className="px-4 py-3 font-medium text-gray-600 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs font-medium">{o.order_number}</td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${STATUS_STYLE[o.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        {STATUS_LABEL[o.status] ?? o.status}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        o.payment_status === 'completed'
                          ? 'bg-green-100 text-green-700'
                          : 'bg-yellow-100 text-yellow-700'
                      }`}>
                        {o.payment_status === 'completed' ? '완료' : '대기'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{fmt(o.total_amount)}원</td>
                    <td className="px-4 py-3 text-gray-500">{o.items_count}건</td>
                    <td className="px-4 py-3 text-gray-400 whitespace-nowrap">{fmtDate(o.created_at)}</td>
                    <td className="px-4 py-3">
                      <select
                        value={o.status}
                        disabled={updating === o.id}
                        onChange={(e) => handleStatusChange(o.id, e.target.value)}
                        className="text-xs border rounded-lg px-2 py-1.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50"
                      >
                        {STATUS_OPTIONS.filter((s) => s.value).map((s) => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        <div className="px-4 py-3 border-t flex items-center justify-between">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-30 hover:text-gray-900"
          >
            <ChevronLeft className="w-4 h-4" /> 이전
          </button>
          <span className="text-sm text-gray-500">페이지 {page}</span>
          <button
            onClick={() => setPage((p) => p + 1)}
            disabled={orders.length < 20}
            className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-30 hover:text-gray-900"
          >
            다음 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

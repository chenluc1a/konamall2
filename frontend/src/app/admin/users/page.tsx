'use client';

import { useEffect, useState, useCallback } from 'react';
import { api } from '@/lib/api';
import { Users, Search, RefreshCw, ChevronLeft, ChevronRight, ShieldAlert, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

interface UserRow {
  id: number;
  email: string;
  name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  created_at: string;
}

const fmtDate = (s: string) => new Date(s).toLocaleString('ko-KR', {
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit'
});

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/admin/users', { params: { page, limit: 20, search: search || undefined } })
      .then((r) => setUsers(r.data))
      .catch((e) => toast.error(e.response?.data?.detail || '불러오기 실패'))
      .finally(() => setLoading(false));
  }, [page, search]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Users className="w-7 h-7 text-primary-500" />
          회원 관리
        </h1>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> 새로고침
        </button>
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-3">
        <div className="flex-1 max-w-md flex items-center gap-2 border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-primary-500">
          <Search className="w-4 h-4 text-gray-400" />
          <input
            className="text-sm outline-none bg-transparent w-full"
            placeholder="이름 또는 이메일 검색"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && load()}
          />
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> 불러오는 중...
          </div>
        ) : users.length === 0 ? (
          <div className="p-10 text-center text-gray-400">가입된 회원이 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">ID</th>
                  <th className="px-4 py-3 font-medium text-gray-600">이름 / 연락처</th>
                  <th className="px-4 py-3 font-medium text-gray-600">권한</th>
                  <th className="px-4 py-3 font-medium text-gray-600">가입일</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-4 align-top w-20">
                      <div className="text-sm font-medium text-gray-500 mb-1">#{u.id}</div>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${u.is_active ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {u.is_active ? '정상' : '정지'}
                      </span>
                    </td>
                    <td className="px-4 py-4 align-top w-80">
                      <div className="font-semibold text-gray-800 text-base">{u.name}</div>
                      <div className="text-gray-500 mt-0.5 flex items-center gap-2">
                        {u.email}
                      </div>
                      {u.phone && <div className="text-xs text-gray-400 mt-1">{u.phone.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3')}</div>}
                    </td>
                    <td className="px-4 py-4 align-top w-40">
                      {u.role === 'admin' ? (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-purple-100 text-purple-700 font-medium rounded-full text-xs border border-purple-200">
                          <ShieldCheck className="w-3.5 h-3.5" />
                          관리자
                        </div>
                      ) : (
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 text-slate-700 font-medium rounded-full text-xs">
                          <Users className="w-3.5 h-3.5" />
                          회원
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 align-top text-gray-500 whitespace-nowrap">
                      {fmtDate(u.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 페이지네이션 */}
        <div className="px-4 py-3 border-t flex items-center justify-between bg-gray-50">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 text-sm text-gray-600 font-medium disabled:opacity-30">
            <ChevronLeft className="w-4 h-4 text-gray-400" /> 이전 페이지
          </button>
          <span className="text-sm text-gray-500 font-medium">{page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={users.length < 20} className="flex items-center gap-1 text-sm text-gray-600 font-medium disabled:opacity-30">
            다음 페이지 <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api } from '@/lib/api';
import { Package, ExternalLink, Search, RefreshCw, ChevronLeft, ChevronRight, Globe, Edit2, Check, X } from 'lucide-react';
import toast from 'react-hot-toast';

interface ProductRow {
  id: number;
  title: string;
  title_ko?: string;
  category?: string;
  price_original?: number;
  price_final?: number;
  stock: number;
  is_active: boolean;
  created_at?: string;
}

const fmt = (n: number | undefined) => (n != null ? new Intl.NumberFormat('ko-KR').format(n) : '-');

export default function AdminProductsPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  
  // 필터
  const [category, setCategory] = useState('');
  const [isActive, setIsActive] = useState('');
  const [untranslated, setUntranslated] = useState(searchParams.get('untranslated') === 'true');

  // 상태 (로딩중인 아이템)
  const [updating, setUpdating] = useState<number | null>(null);
  const [translating, setTranslating] = useState<number | null>(null);

  // 가격 수정 모드
  const [editingPriceId, setEditingPriceId] = useState<number | null>(null);
  const [editPriceValue, setEditPriceValue] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.get('/api/admin/products', {
      params: {
        page, limit: 20,
        search: search || undefined,
        category: category || undefined,
        is_active: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
        untranslated: untranslated ? true : undefined,
      }
    })
      .then((r) => setProducts(r.data))
      .catch((e) => toast.error(e.response?.data?.detail || '불러오기 실패'))
      .finally(() => setLoading(false));
  }, [page, search, category, isActive, untranslated]);

  useEffect(() => { load(); }, [load]);

  const toggleActive = async (id: number, current: boolean) => {
    setUpdating(id);
    try {
      await api.patch(`/api/admin/products/${id}/active`, { is_active: !current });
      setProducts(prev => prev.map(p => p.id === id ? { ...p, is_active: !current } : p));
      toast.success(!current ? '상품이 활성화되었습니다.' : '상품이 비활성화되었습니다.');
    } catch (e: any) {
      toast.error('상태 변경 실패');
    } finally {
      setUpdating(null);
    }
  };

  const savePrice = async (id: number) => {
    const p = parseInt(editPriceValue.replace(/,/g, ''), 10);
    if (isNaN(p) || p <= 0) {
      toast.error('유효한 가격을 입력하세요.');
      return;
    }
    setUpdating(id);
    try {
      const res = await api.patch(`/api/admin/products/${id}/price`, { selling_price: p });
      setProducts(prev => prev.map(prod => prod.id === id ? { ...prod, price_final: res.data.selling_price } : prod));
      toast.success('판매가가 수정되었습니다.');
      setEditingPriceId(null);
    } catch (e: any) {
      toast.error('가격 수정 실패');
    } finally {
      setUpdating(null);
    }
  };

  const translateProduct = async (id: number) => {
    setTranslating(id);
    try {
      const res = await api.post(`/api/admin/products/${id}/translate`);
      if (res.data.queued) {
        toast.success('번역 작업이 큐에 등록되었습니다. 잠시 후 새로고침 해주세요.');
      } else if (res.data.translated) {
        toast.success('번역이 완료되었습니다.');
        load();
      } else {
        toast('이미 번역되었거나 수정된 내용이 없습니다.');
      }
    } catch (e: any) {
      toast.error('번역 실행 실패 (API 키 미설정 등)');
    } finally {
      setTranslating(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
          <Package className="w-7 h-7 text-primary-500" />
          상품 관리
        </h1>
        <button onClick={load} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700">
          <RefreshCw className="w-4 h-4" /> 새로고침
        </button>
      </div>

      {/* 필터 바 */}
      <div className="bg-white rounded-xl shadow-sm p-4 grid grid-cols-1 md:grid-cols-5 gap-3">
        <select value={category} onChange={e => { setCategory(e.target.value); setPage(1); }} className="text-sm border rounded-lg px-3 py-2 outline-none focus:border-primary-500">
          <option value="">모든 카테고리</option>
          <option value="fashion">패션</option>
          <option value="electronics">전자기기</option>
          <option value="home">홈 & 리빙</option>
          <option value="beauty">뷰티</option>
        </select>
        
        <select value={isActive} onChange={e => { setIsActive(e.target.value); setPage(1); }} className="text-sm border rounded-lg px-3 py-2 outline-none focus:border-primary-500">
          <option value="">전체 상태</option>
          <option value="true">판매중(활성)</option>
          <option value="false">비활성</option>
        </select>

        <label className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded-lg border cursor-pointer hover:bg-gray-100">
          <input type="checkbox" checked={untranslated} onChange={e => { setUntranslated(e.target.checked); setPage(1); }} className="rounded accent-primary-500 w-4 h-4" />
          <span>미번역 상품만</span>
        </label>

        <div className="md:col-span-2 flex items-center gap-2 border rounded-lg px-3 py-2 focus-within:ring-2 focus-within:ring-primary-500">
          <Search className="w-4 h-4 text-gray-400" />
          <input className="text-sm outline-none bg-transparent w-full" placeholder="상품명 검색" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
        </div>
      </div>

      {/* 테이블 */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-gray-400">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2" /> 불러오는 중...
          </div>
        ) : products.length === 0 ? (
          <div className="p-10 text-center text-gray-400">검색 결과가 없습니다.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 font-medium text-gray-600">ID / 상태</th>
                  <th className="px-4 py-3 font-medium text-gray-600">상품명 (원문 / 번역)</th>
                  <th className="px-4 py-3 font-medium text-gray-600">카테고리</th>
                  <th className="px-4 py-3 font-medium text-gray-600">판매가(KRW) / 마진율</th>
                  <th className="px-4 py-3 font-medium text-gray-600">작업</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const margin = p.price_original && p.price_final 
                    ? Math.round(((p.price_final - p.price_original) / Math.max(p.price_original, 1)) * 100) 
                    : 0;

                  return (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 align-top min-w-[100px]">
                        <div className="text-xs text-gray-400 mb-1">#{p.id}</div>
                        <button
                          onClick={() => toggleActive(p.id, p.is_active)}
                          disabled={updating === p.id}
                          className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                            p.is_active ? 'bg-green-100 text-green-700 hover:bg-green-200' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {p.is_active ? '🟢 판매중' : '⚫ 비활성'}
                        </button>
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="text-sm font-medium text-gray-800 line-clamp-2" title={p.title_ko || '미번역'}>
                          {p.title_ko || <span className="text-red-400 italic font-normal">미번역</span>}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 line-clamp-1" title={p.title}>{p.title}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-600">{p.category ?? '-'}</td>
                      
                      <td className="px-4 py-3 whitespace-nowrap">
                        {editingPriceId === p.id ? (
                          <div className="flex items-center gap-1">
                            <input 
                              autoFocus 
                              value={editPriceValue} 
                              onChange={e => setEditPriceValue(e.target.value)} 
                              onKeyDown={e => e.key === 'Enter' && savePrice(p.id)}
                              className="w-24 border rounded px-2 py-1 text-sm outline-none focus:border-primary-500" 
                            />
                            <button onClick={() => savePrice(p.id)} className="p-1 text-green-600 hover:bg-green-50 rounded"><Check className="w-4 h-4"/></button>
                            <button onClick={() => setEditingPriceId(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X className="w-4 h-4"/></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setEditPriceValue(p.price_final?.toString() || ''); setEditingPriceId(p.id); }}>
                            <div className="font-medium text-gray-800">{fmt(p.price_final)}원</div>
                            <Edit2 className="w-3 h-3 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                          </div>
                        )}
                        <div className="text-xs mt-1">
                          <span className="text-gray-400">원가: {fmt(p.price_original)}</span>
                          <span className={`ml-1 font-medium ${margin > 40 ? 'text-green-600' : margin < 10 ? 'text-red-500' : 'text-blue-600'}`}>
                            ({margin > 0 ? '+' : ''}{margin}%)
                          </span>
                        </div>
                      </td>
                      
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-2">
                          {!p.title_ko && (
                            <button
                              onClick={() => translateProduct(p.id)}
                              disabled={translating === p.id}
                              className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-50 text-indigo-600 text-xs font-medium rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
                            >
                              {translating === p.id ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
                              번역
                            </button>
                          )}
                          <Link href={`/products/${p.id}`} target="_blank" className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 transition-colors">
                            <ExternalLink className="w-3.5 h-3.5" /> 보기
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="px-4 py-3 border-t flex items-center justify-between">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" /> 이전
          </button>
          <span className="text-sm text-gray-500">페이지 {page}</span>
          <button onClick={() => setPage(p => p + 1)} disabled={products.length < 20} className="flex items-center gap-1 text-sm text-gray-600 disabled:opacity-30">
            다음 <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

/**
 * 결제 완료 콜백 페이지
 * KakaoPay/NaverPay PG에서 결제 승인 후 리다이렉트되는 프론트 페이지.
 *
 * URL 예: /payment/result?order_id=42&pg_token=xxxx&gateway=kakao_pay
 *
 * 동작:
 *  1. 쿼리 파라미터에서 order_id, pg_token, gateway 추출
 *  2. 백엔드 POST /api/payments/approve 호출
 *  3. 성공 → /orders/[id]로 이동 (장바구니 초기화)
 *  4. 실패 → 에러 메시지 표시
 */
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { paymentsApi } from '@/lib/services';
import { useCartStore } from '@/store/cartStore';
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import Link from 'next/link';

type ResultState = 'loading' | 'success' | 'error';

export default function PaymentResultPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clearCart = useCartStore((s) => s.clearCart);

  const [state, setState] = useState<ResultState>('loading');
  const [orderId, setOrderId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    const order_id = Number(searchParams.get('order_id'));
    const pg_token = searchParams.get('pg_token') || '';
    const gateway = searchParams.get('gateway') || 'kakao_pay';
    const payment_id = searchParams.get('payment_id') || searchParams.get('tid') || '';

    if (!order_id) {
      setErrorMsg('주문 정보가 없습니다.');
      setState('error');
      return;
    }

    setOrderId(order_id);

    (async () => {
      try {
        await paymentsApi.approve(order_id, payment_id, pg_token, gateway);
        clearCart();
        setState('success');
        // 2초 후 주문 상세로 이동
        setTimeout(() => router.replace(`/orders/${order_id}`), 2000);
      } catch (err: any) {
        const msg = err?.response?.data?.detail || '결제 처리 중 오류가 발생했습니다.';
        setErrorMsg(msg);
        setState('error');
      }
    })();
  }, [searchParams, router, clearCart]);

  if (state === 'loading') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-12 h-12 animate-spin text-primary-500" />
        <p className="text-gray-600 font-medium">결제를 처리하고 있습니다...</p>
        <p className="text-sm text-gray-400">잠시만 기다려 주세요</p>
      </div>
    );
  }

  if (state === 'success') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-bounce">
          <CheckCircle2 className="w-12 h-12 text-green-500" />
        </div>
        <h1 className="text-2xl font-bold text-gray-800">결제 완료!</h1>
        <p className="text-gray-500">주문이 성공적으로 완료되었습니다.</p>
        <p className="text-sm text-gray-400">주문 상세 페이지로 이동합니다...</p>
        {orderId && (
          <Link
            href={`/orders/${orderId}`}
            className="mt-4 px-8 py-3 bg-primary-500 text-white rounded-full font-medium"
          >
            주문 상세 보기
          </Link>
        )}
      </div>
    );
  }

  // error
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4">
      <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
        <XCircle className="w-12 h-12 text-red-500" />
      </div>
      <h1 className="text-2xl font-bold text-gray-800">결제 실패</h1>
      <p className="text-gray-500 text-center max-w-xs">{errorMsg}</p>
      <div className="flex gap-3 mt-4">
        {orderId && (
          <Link
            href={`/orders/${orderId}`}
            className="px-6 py-3 border-2 border-primary-500 text-primary-600 rounded-full font-medium"
          >
            주문 상세
          </Link>
        )}
        <Link
          href="/"
          className="px-6 py-3 bg-gray-100 text-gray-700 rounded-full font-medium"
        >
          홈으로
        </Link>
      </div>
    </div>
  );
}

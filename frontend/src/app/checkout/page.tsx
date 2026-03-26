'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { cartApi, ordersApi, paymentsApi, addressesApi, formatPrice, type AddressOut } from '@/lib/services';
import { useCartStore } from '@/store/cartStore';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import { MapPin, CreditCard, Loader2, Plus } from 'lucide-react';

const PAYMENT_METHODS = [
  { value: 'kakao_pay', label: '카카오페이' },
  { value: 'naver_pay', label: '네이버페이' },
  { value: 'card', label: '카드' },
];

export default function CheckoutPage() {
  const router = useRouter();
  const hasToken = useAuthStore((s) => !!s.token);
  const { items: localItems, saveToServer } = useCartStore();
  const [step, setStep] = useState<'loading' | 'cart' | 'address' | 'pay'>('loading');
  const [serverCart, setServerCart] = useState<{ items: any[]; subtotal: number; shipping_fee: number; total: number } | null>(null);
  const [addresses, setAddresses] = useState<AddressOut[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState('kakao_pay');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showAddAddress, setShowAddAddress] = useState(false);
  const [newAddress, setNewAddress] = useState({
    recipient_name: '',
    phone: '',
    zip_code: '',
    address1: '',
    address2: '',
    is_default: true,
  });

  useEffect(() => {
    if (!hasToken) {
      router.replace('/login?redirect=/checkout');
      return;
    }
    (async () => {
      try {
        // 로컬 장바구니를 서버에 반영
        if (localItems?.length) {
          for (const item of localItems) {
            try {
              await cartApi.addItem(item.productId, item.quantity, item.variantId);
            } catch (_) {}
          }
        }
        const cart = await cartApi.get();
        if (!cart?.items?.length) {
          toast.error('장바구니가 비어 있습니다.');
          router.replace('/cart');
          return;
        }
        setServerCart({
          items: cart.items,
          subtotal: cart.subtotal ?? 0,
          shipping_fee: cart.shipping_fee ?? 0,
          total: cart.total ?? 0,
        });
        const addrs = await addressesApi.list();
        setAddresses(addrs || []);
        if (addrs?.length) setSelectedAddressId(addrs[0].id);
        setStep(addrs?.length ? 'address' : 'address');
      } catch (e) {
        toast.error('정보를 불러오지 못했습니다.');
        router.replace('/cart');
      }
    })();
  }, [hasToken, router]);

  const handleAddAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newAddress.recipient_name || !newAddress.phone || !newAddress.zip_code || !newAddress.address1) {
      toast.error('필수 항목을 입력해주세요.');
      return;
    }
    try {
      const created = await addressesApi.create(newAddress);
      setAddresses((prev) => [...prev, created]);
      setSelectedAddressId(created.id);
      setShowAddAddress(false);
      setNewAddress({ recipient_name: '', phone: '', zip_code: '', address1: '', address2: '', is_default: true });
      toast.success('배송지가 추가되었습니다.');
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '배송지 추가에 실패했습니다.');
    }
  };

  const handlePayment = async () => {
    if (!selectedAddressId || !serverCart) return;
    setSubmitting(true);
    try {
      const order = await ordersApi.createOrder({
        address_id: selectedAddressId,
        payment_method: paymentMethod,
        note: note || undefined,
      });
      const orderId = order.id;
      try {
        const pay = await paymentsApi.prepare(orderId, paymentMethod);
        if (pay?.payment_url) {
          window.location.href = pay.payment_url;
          return;
        }
        toast.error('결제 준비에 실패했습니다. 주문 상세에서 결제를 다시 진행해 주세요.');
        router.push(`/orders/${orderId}`);
        return;
      } catch (payErr) {
        toast.error('결제 준비에 실패했습니다. 주문 상세에서 결제를 다시 진행해 주세요.');
        router.push(`/orders/${orderId}`);
        return;
      }
      toast.success('주문이 완료되었습니다.');
      router.push(`/orders/${orderId}`);
    } catch (err: any) {
      toast.error(err.response?.data?.detail || '주문에 실패했습니다.');
    } finally {
      setSubmitting(false);
    }
  };

  if (step === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-10 h-10 animate-spin text-primary-500" />
      </div>
    );
  }

  if (!serverCart) return null;

  return (
    <div className="min-h-screen bg-gray-50 pb-32 md:pb-8">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <CreditCard className="w-7 h-7 text-primary-500" />
          결제하기
        </h1>

        {/* 주문 상품 요약 */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <h2 className="font-bold mb-3">주문 상품 ({serverCart.items.length}건)</h2>
          <ul className="space-y-2">
            {serverCart.items.map((item: any) => (
              <li key={item.id} className="flex justify-between text-sm">
                <span className="truncate flex-1">{item.product_title} x {item.quantity}</span>
                <span className="font-medium">{formatPrice(item.line_total)}원</span>
              </li>
            ))}
          </ul>
          <div className="border-t mt-3 pt-3 flex justify-between text-sm">
            <span>상품 금액</span>
            <span>{formatPrice(serverCart.subtotal)}원</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>배송비</span>
            <span>{serverCart.shipping_fee === 0 ? '무료' : `${formatPrice(serverCart.shipping_fee)}원`}</span>
          </div>
          <div className="flex justify-between font-bold text-lg mt-2 pt-2 border-t">
            <span>총 결제금액</span>
            <span className="text-primary-600">{formatPrice(serverCart.total)}원</span>
          </div>
        </div>

        {/* 배송지 */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-primary-500" />
            배송지
          </h2>
          {addresses.length === 0 && !showAddAddress && (
            <p className="text-gray-500 text-sm mb-3">등록된 배송지가 없습니다.</p>
          )}
          {addresses.map((addr) => (
            <label
              key={addr.id}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer mb-2 ${
                selectedAddressId === addr.id ? 'border-primary-500 bg-primary-50' : 'border-gray-200'
              }`}
            >
              <input
                type="radio"
                name="address"
                checked={selectedAddressId === addr.id}
                onChange={() => setSelectedAddressId(addr.id)}
                className="mt-1"
              />
              <div>
                <p className="font-medium">{addr.recipient_name} {addr.phone}</p>
                <p className="text-sm text-gray-600">
                  ({addr.zip_code}) {addr.address1} {addr.address2 || ''}
                </p>
              </div>
            </label>
          ))}
          {showAddAddress ? (
            <form onSubmit={handleAddAddress} className="mt-3 space-y-2 p-3 border rounded-lg">
              <input
                placeholder="수령인"
                value={newAddress.recipient_name}
                onChange={(e) => setNewAddress((a) => ({ ...a, recipient_name: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              />
              <input
                placeholder="연락처"
                value={newAddress.phone}
                onChange={(e) => setNewAddress((a) => ({ ...a, phone: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              />
              <input
                placeholder="우편번호"
                value={newAddress.zip_code}
                onChange={(e) => setNewAddress((a) => ({ ...a, zip_code: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              />
              <input
                placeholder="주소"
                value={newAddress.address1}
                onChange={(e) => setNewAddress((a) => ({ ...a, address1: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              />
              <input
                placeholder="상세주소"
                value={newAddress.address2}
                onChange={(e) => setNewAddress((a) => ({ ...a, address2: e.target.value }))}
                className="w-full border rounded px-3 py-2"
              />
              <div className="flex gap-2">
                <button type="submit" className="px-4 py-2 bg-primary-500 text-white rounded-lg text-sm">
                  저장
                </button>
                <button type="button" onClick={() => setShowAddAddress(false)} className="px-4 py-2 border rounded-lg text-sm">
                  취소
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setShowAddAddress(true)}
              className="flex items-center gap-2 text-primary-600 text-sm mt-2"
            >
              <Plus className="w-4 h-4" />
              새 배송지 추가
            </button>
          )}
        </div>

        {/* 결제 수단 */}
        <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
          <h2 className="font-bold mb-3">결제 수단</h2>
          <div className="space-y-2">
            {PAYMENT_METHODS.map((pm) => (
              <label key={pm.value} className="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-gray-50">
                <input
                  type="radio"
                  name="payment"
                  value={pm.value}
                  checked={paymentMethod === pm.value}
                  onChange={() => setPaymentMethod(pm.value)}
                />
                <span>{pm.label}</span>
              </label>
            ))}
          </div>
          <div className="mt-3">
            <label className="block text-sm text-gray-600 mb-1">배송 메모 (선택)</label>
            <input
              type="text"
              placeholder="문 앞에 놓아주세요 등"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>

        {/* 결제 버튼 */}
        <button
          onClick={handlePayment}
          disabled={!selectedAddressId || submitting}
          className="w-full py-4 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-bold rounded-xl flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
          {formatPrice(serverCart.total)}원 결제하기
        </button>

        <Link href="/cart" className="block text-center text-gray-500 text-sm mt-4">
          장바구니로 돌아가기
        </Link>
      </div>
    </div>
  );
}

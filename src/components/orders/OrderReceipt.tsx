import React from "react";
import { formatCurrency } from "@/lib/restaurant";
import { formatDate, formatTime } from "@/i18n/formatters";

interface OrderReceiptProps {
  order: {
    id: string;
    order_number?: string | null;
    tracking_code: string;
    customer_name: string;
    customer_phone: string;
    customer_email?: string | null;
    delivery_address?: string | null;
    delivery_notes?: string | null;
    notes?: string | null;
    status: string;
    fulfillment_type?: string | null;
    payment_method: string;
    payment_status: string;
    subtotal: number;
    tax_amount: number;
    delivery_fee: number;
    discount_amount: number;
    discount_code?: string | null;
    total_amount: number;
    created_at: string;
  };
  items: Array<{
    id: string;
    item_name: string;
    quantity: number;
    unit_price: number;
    line_total: number;
    notes?: string | null;
  }>;
  restaurantName?: string | null;
  isPrintOnly?: boolean;
}

export function OrderReceipt({ order, items, restaurantName, isPrintOnly = false }: OrderReceiptProps) {
  const isPickup =
    order.fulfillment_type === "pickup" ||
    order.delivery_address?.toLowerCase().includes("pickup");

  const totalItemsCount = items.reduce((sum, it) => sum + (it.quantity || 1), 0);

  return (
    <div
      id={isPrintOnly ? "order-receipt-print" : undefined}
      className={`bg-white text-zinc-900 font-mono text-[13px] leading-relaxed p-6 rounded-xl border border-zinc-200 shadow-xs max-w-[420px] mx-auto ${
        isPrintOnly ? "hidden print:block print:p-0 print:border-0 print:shadow-none print:max-w-none" : ""
      }`}
      style={{ fontFamily: "'Courier New', Courier, monospace, monospace" }}
    >
      {/* Receipt Header */}
      <div className="text-center pb-3 border-b-2 border-dashed border-zinc-400 space-y-1">
        <h2 className="text-lg font-black tracking-tight uppercase text-zinc-950">
          {restaurantName || "Royal Restaurant"}
        </h2>
        <p className="text-[11px] font-bold tracking-widest text-zinc-600 uppercase">
          *** ORDER RECEIPT ***
        </p>
        <p className="text-xs text-zinc-700 font-semibold pt-1">
          Order #: <span className="text-zinc-950 font-black">{order.order_number || order.tracking_code}</span>
        </p>
        <p className="text-[11px] text-zinc-600">
          {formatDate(order.created_at)} • {formatTime(order.created_at)}
        </p>
      </div>

      {/* Fulfillment & Customer Info */}
      <div className="py-2.5 border-b border-dashed border-zinc-300 text-xs space-y-1">
        <div className="flex justify-between font-bold">
          <span className="text-zinc-600">ORDER TYPE:</span>
          <span className="uppercase text-zinc-950 font-black">
            {isPickup ? "PICKUP / TAKEAWAY" : "HOME DELIVERY"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600">CUSTOMER:</span>
          <span className="font-bold text-zinc-900">{order.customer_name || "Guest Customer"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600">PHONE:</span>
          <span className="font-bold text-zinc-900">{order.customer_phone}</span>
        </div>
        {!isPickup && order.delivery_address && (
          <div className="pt-0.5">
            <span className="text-zinc-600 block text-[11px]">DELIVERY ADDRESS:</span>
            <p className="font-semibold text-zinc-900 break-words">{order.delivery_address}</p>
          </div>
        )}
        {order.delivery_notes && (
          <p className="text-[11px] text-zinc-700 italic pt-0.5">
            Note: {order.delivery_notes}
          </p>
        )}
      </div>

      {/* Itemized Table */}
      <div className="py-2.5 border-b-2 border-dashed border-zinc-400">
        <div className="flex justify-between text-[11px] font-black text-zinc-700 pb-1 border-b border-zinc-200 uppercase tracking-wider">
          <span className="w-8">QTY</span>
          <span className="flex-1 px-2">ITEM</span>
          <span className="w-16 text-right">PRICE</span>
          <span className="w-16 text-right">TOTAL</span>
        </div>

        <div className="divide-y divide-zinc-100 pt-1">
          {items.map((item) => (
            <div key={item.id} className="py-1.5 text-xs">
              <div className="flex items-start justify-between">
                <span className="w-8 font-black text-zinc-950">{item.quantity}x</span>
                <span className="flex-1 px-2 font-bold text-zinc-900 break-words">
                  {item.item_name}
                </span>
                <span className="w-16 text-right text-zinc-600">
                  {formatCurrency(item.unit_price)}
                </span>
                <span className="w-16 text-right font-black text-zinc-950">
                  {formatCurrency(item.line_total || item.quantity * item.unit_price)}
                </span>
              </div>
              {item.notes && (
                <p className="text-[11px] text-zinc-600 italic pl-8 pt-0.5">
                  ↳ {item.notes}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Bill Breakdown */}
      <div className="py-2.5 border-b-2 border-dashed border-zinc-400 text-xs space-y-1">
        <div className="flex justify-between text-zinc-700">
          <span>Items Subtotal ({totalItemsCount}):</span>
          <span className="font-semibold">{formatCurrency(order.subtotal)}</span>
        </div>
        {Number(order.delivery_fee) > 0 && (
          <div className="flex justify-between text-zinc-700">
            <span>Delivery Fee:</span>
            <span className="font-semibold">{formatCurrency(order.delivery_fee)}</span>
          </div>
        )}
        {Number(order.tax_amount) > 0 && (
          <div className="flex justify-between text-zinc-700">
            <span>Tax / VAT:</span>
            <span className="font-semibold">{formatCurrency(order.tax_amount)}</span>
          </div>
        )}
        {Number(order.discount_amount) > 0 && (
          <div className="flex justify-between text-emerald-700 font-medium">
            <span>Discount {order.discount_code ? `(${order.discount_code})` : ""}:</span>
            <span>-{formatCurrency(order.discount_amount)}</span>
          </div>
        )}

        {/* Grand Total */}
        <div className="pt-2 border-t border-zinc-300 flex justify-between items-center text-sm font-black text-zinc-950">
          <span className="tracking-wide">TOTAL AMOUNT:</span>
          <span className="text-base">{formatCurrency(order.total_amount)}</span>
        </div>
      </div>

      {/* Payment & Order Status */}
      <div className="py-2 border-b border-dashed border-zinc-300 text-xs space-y-1">
        <div className="flex justify-between">
          <span className="text-zinc-600">PAYMENT METHOD:</span>
          <span className="font-bold text-zinc-950 uppercase">{order.payment_method || "CASH"}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600">PAYMENT STATUS:</span>
          <span className={`font-black uppercase ${order.payment_status?.toLowerCase() === "paid" ? "text-emerald-700" : "text-amber-700"}`}>
            {order.payment_status || "UNPAID"}
          </span>
        </div>
        <div className="flex justify-between">
          <span className="text-zinc-600">ORDER STATUS:</span>
          <span className="font-bold text-zinc-900 uppercase">{order.status}</span>
        </div>
      </div>

      {/* Customer Instructions (if any) */}
      {order.notes && (
        <div className="py-2 border-b border-dashed border-zinc-300 text-xs">
          <span className="text-zinc-600 font-bold block text-[11px]">SPECIAL INSTRUCTIONS:</span>
          <p className="text-zinc-900 italic font-medium">{order.notes}</p>
        </div>
      )}

      {/* Footer & Tracking */}
      <div className="pt-3 text-center space-y-1">
        <p className="text-[11px] font-bold tracking-widest text-zinc-800 uppercase">
          TRACKING CODE: {order.tracking_code}
        </p>
        <p className="text-xs font-semibold text-zinc-700">
          Thank you for your order!
        </p>
        <p className="text-[10px] text-zinc-500">
          Please retain this receipt for your reference.
        </p>
      </div>
    </div>
  );
}

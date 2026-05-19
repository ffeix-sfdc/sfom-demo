import React from "react";
import { useLang } from "../i18n/LangContext";

export default function OrderResult({ result, activeOrg, onDismiss }) {
  const { t } = useLang();
  const summaryUrl =
    activeOrg && result.order_summary_id
      ? `${activeOrg.instance_url}/lightning/r/OrderSummary/${result.order_summary_id}/view`
      : null;

  return (
    <div className="bg-white rounded-xl shadow-lg border p-6 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
            <span className="text-green-600 text-lg">✓</span>
          </div>
          <h2 className="text-lg font-semibold text-gray-800">{t.orderCreated}</h2>
        </div>
        {onDismiss && (
          <button onClick={onDismiss} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        )}
      </div>

      <div className="bg-gray-50 rounded p-4 space-y-2 font-mono text-sm">
        {result.order_summary_id && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-sans">{t.orderSummaryId}</span>
            <span className="font-medium">{result.order_summary_id}</span>
          </div>
        )}
        {result.order_id && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-sans">{t.orderId}</span>
            <span>{result.order_id}</span>
          </div>
        )}
        {result.oci_action_request_id && (
          <div className="flex items-center justify-between">
            <span className="text-gray-500 font-sans">{t.ociActionRequestId}</span>
            <span className="text-xs">{result.oci_action_request_id}</span>
          </div>
        )}
      </div>

      {result.oci_result && (
        <div className={`rounded p-3 text-sm ${result.oci_result.error ? "bg-amber-50 border border-amber-200 text-amber-700" : "bg-green-50 border border-green-200 text-green-700"}`}>
          <p className="font-medium mb-1">{result.oci_result.error ? t.ociError : t.ociSuccess}</p>
          {result.oci_result.error
            ? <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(result.oci_result.error, null, 2)}</pre>
            : <pre className="text-xs whitespace-pre-wrap">{JSON.stringify(result.oci_result, null, 2)}</pre>
          }
        </div>
      )}

      {summaryUrl && (
        <a
          href={summaryUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="block w-full text-center bg-[#00A1E0] text-white rounded px-4 py-2.5 font-medium hover:bg-[#0086b3] transition text-sm"
        >
          {t.viewInSalesforce}
        </a>
      )}
    </div>
  );
}

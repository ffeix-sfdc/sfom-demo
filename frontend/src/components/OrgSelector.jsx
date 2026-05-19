import React, { useEffect, useState, useRef } from "react";
import api from "../api/client";
import { useLang } from "../i18n/LangContext";

export default function OrgSelector({ onOrgChange }) {
  const { t } = useLang();
  const [orgs, setOrgs] = useState([]);
  const [activeAlias, setActiveAlias] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newAlias, setNewAlias] = useState("");
  const [loginStatus, setLoginStatus] = useState(null); // null | "waiting" | "done" | "error"
  const [loginError, setLoginError] = useState(null);
  const pollRef = useRef(null);

  const fetchOrgs = async () => {
    try {
      const res = await api.get("/orgs");
      setOrgs(res.data.orgs || []);
      const active = res.data.active;
      if (active) {
        setActiveAlias(active);
        const org = (res.data.orgs || []).find((o) => o.alias === active);
        if (org) onOrgChange(org);
      }
    } catch (_) {}
  };

  useEffect(() => {
    fetchOrgs();
    return () => clearPoll();
  }, []);

  const clearPoll = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const handleSwitch = async (alias) => {
    await api.post("/orgs/activate", { alias });
    setActiveAlias(alias);
    const org = orgs.find((o) => o.alias === alias);
    if (org) onOrgChange(org);
  };

  const handleAddOrg = async () => {
    const alias = newAlias.trim();
    if (!alias) return;
    setLoginStatus("waiting");
    setLoginError(null);

    try {
      await api.post("/auth/login", { alias });
    } catch (e) {
      setLoginStatus("error");
      setLoginError(e.response?.data?.detail || e.message);
      return;
    }

    // Poll until login completes
    pollRef.current = setInterval(async () => {
      try {
        const res = await api.get(`/auth/login/${alias}/status`);
        if (res.data.status === "done") {
          clearPoll();
          setLoginStatus("done");
          await fetchOrgs();
          await handleSwitch(alias);
          setShowAddForm(false);
          setNewAlias("");
          setLoginStatus(null);
        } else if (res.data.status === "error") {
          clearPoll();
          setLoginStatus("error");
          setLoginError(res.data.detail || "Login failed");
        }
      } catch (_) {}
    }, 1500);

    // Timeout after 3 minutes
    setTimeout(() => {
      if (loginStatus === "waiting") {
        clearPoll();
        setLoginStatus("error");
        setLoginError("Timeout — please try again");
      }
    }, 180000);
  };

  const activeOrg = orgs.find((o) => o.alias === activeAlias);

  return (
    <div className="relative flex flex-col items-end gap-0.5">
      <div className="flex items-center gap-2">
        {/* Org dropdown */}
        {orgs.length > 0 && (
          <select
            className="text-sm border rounded px-2 py-1 bg-white max-w-[140px] truncate"
            style={{ maxWidth: "140px" }}
            value={activeAlias || ""}
            title={activeOrg?.alias || activeOrg?.username || ""}
            onChange={(e) => handleSwitch(e.target.value)}
          >
            {orgs.map((org) => (
              <option key={org.alias} value={org.alias} title={org.username}>
                {org.alias || org.username}
              </option>
            ))}
          </select>
        )}

        {/* Add org button */}
        <button
          onClick={() => {
            setShowAddForm(!showAddForm);
            setLoginStatus(null);
            setLoginError(null);
          }}
          className="text-sm bg-white text-[#00A1E0] px-3 py-1 rounded font-medium hover:bg-gray-100 transition"
        >
          {t.addOrg}
        </button>

      </div>

      {/* Username below controls */}
      {activeOrg && (
        <span className="text-xs text-white/70 max-w-[200px] truncate text-right" title={activeOrg.username}>
          {activeOrg.username}
        </span>
      )}

      {/* Add org panel */}
      {showAddForm && (
        <div className="absolute right-0 top-10 bg-white border rounded-lg shadow-lg p-4 z-50 w-72">
          <p className="text-sm font-semibold mb-3 text-gray-700">{t.addSalesforceOrg}</p>

          {loginStatus === "waiting" ? (
            <div className="text-center py-4">
              <div className="animate-spin w-6 h-6 border-2 border-[#00A1E0] border-t-transparent rounded-full mx-auto mb-3" />
              <p className="text-sm text-gray-600">
                {t.browserWindowOpened}<br />
                {t.signInToContinue}
              </p>
            </div>
          ) : loginStatus === "done" ? (
            <p className="text-sm text-green-600 text-center py-2">{t.connected}</p>
          ) : (
            <>
              <label className="text-xs text-gray-500 block mb-1">{t.alias}</label>
              <input
                className="w-full border rounded px-2 py-1.5 text-sm mb-3"
                placeholder={t.aliasPlaceholder}
                value={newAlias}
                onChange={(e) => setNewAlias(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddOrg()}
                autoFocus
              />
              {loginError && (
                <p className="text-xs text-red-500 mb-2">{loginError}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={handleAddOrg}
                  disabled={!newAlias.trim()}
                  className="flex-1 bg-[#00A1E0] text-white text-sm rounded px-3 py-1.5 font-medium hover:bg-[#0086b3] transition disabled:opacity-40"
                >
                  {t.openSalesforceLogin}
                </button>
                <button
                  onClick={() => {
                    setShowAddForm(false);
                    clearPoll();
                  }}
                  className="text-sm text-gray-500 hover:text-gray-700 px-2"
                >
                  {t.cancel}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

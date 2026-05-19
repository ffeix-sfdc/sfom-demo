import React, { useState, useEffect, useRef } from "react";
import api from "../api/client";
import { useLang } from "../i18n/LangContext";

export default function UseCasePanel({ currentForm, currentProducts, currentAccount, currentTab = "order", onRestore }) {
  const { t } = useLang();
  const [visible, setVisible] = useState(false);
  const [useCases, setUseCases] = useState([]);
  const [saving, setSaving] = useState(false);
  const [saveName, setSaveName] = useState("");
  const [saveDesc, setSaveDesc] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const hideTimer = useRef(null);
  const importRef = useRef(null);

  const fetchUseCases = () =>
    api.get("/use-cases").then((r) => setUseCases(r.data)).catch(() => {});

  useEffect(() => { fetchUseCases(); }, []);

  const showPanel = () => {
    clearTimeout(hideTimer.current);
    setVisible(true);
  };
  const scheduleHide = () => {
    hideTimer.current = setTimeout(() => setVisible(false), 300);
  };

  const handleSave = async () => {
    if (!saveName.trim()) return;
    await api.post("/use-cases", {
      name: saveName.trim(),
      description: saveDesc.trim(),
      tab: currentTab,
      form: currentForm,
      products: currentProducts,
      account: currentAccount || null,
    });
    setSaveName("");
    setSaveDesc("");
    setSaving(false);
    fetchUseCases();
  };

  const handleRestore = (uc) => {
    onRestore(uc.form, uc.products, uc.account || null);
    setVisible(false);
  };

  const handleUpdate = async (uc) => {
    await api.put(`/use-cases/${uc.id}`, {
      name: uc.name,
      description: uc.description,
      tab: uc.tab || currentTab,
      form: currentForm,
      products: currentProducts,
      account: currentAccount || null,
    });
    fetchUseCases();
  };

  const startEdit = (uc) => {
    setEditingId(uc.id);
    setEditName(uc.name);
    setEditDesc(uc.description || "");
  };

  const handleEditSave = async (uc) => {
    if (!editName.trim()) return;
    await api.put(`/use-cases/${uc.id}`, {
      name: editName.trim(),
      description: editDesc.trim(),
      tab: uc.tab || currentTab,
      form: uc.form,
      products: uc.products,
      account: uc.account || null,
    });
    setEditingId(null);
    fetchUseCases();
  };

  const handleDelete = async (id) => {
    await api.delete(`/use-cases/${id}`);
    setConfirmDelete(null);
    fetchUseCases();
  };

  const handleExport = () => {
    window.open("http://localhost:8000/use-cases/export", "_blank");
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch {
      alert(t.invalidJsonFile);
      return;
    }
    const res = await api.post("/use-cases/import", data, {
      headers: { "Content-Type": "application/json" },
    });
    alert(t.importedCount(res.data.imported));
    fetchUseCases();
    e.target.value = "";
  };

  return (
    <>
      {/* Trigger strip — left side */}
      <div
        className="fixed z-40"
        style={{ top: "calc(50% - 70px)", left: 0, transform: "translateY(-50%)" }}
        onMouseEnter={showPanel}
        onMouseLeave={scheduleHide}
      >
        <div
          className={`bg-[#00A1E0] text-white flex items-center justify-center cursor-pointer transition-all duration-200 rounded-r-lg shadow-lg ${visible ? "w-2" : "w-6"}`}
          style={{ height: "120px" }}
        >
          {!visible && (
            <span
              className="text-xs font-semibold tracking-widest select-none px-1"
              style={{ writingMode: "vertical-lr" }}
            >
              {t.useCases}
            </span>
          )}
        </div>
      </div>

      {/* Panel — slides from left */}
      <div
        className={`fixed top-0 left-0 h-full w-[427px] bg-white shadow-2xl border-r z-30 flex flex-col transition-transform duration-200 ${visible ? "translate-x-0" : "-translate-x-full"}`}
        onMouseEnter={showPanel}
        onMouseLeave={scheduleHide}
      >
        {/* Header */}
        <div className="bg-[#00A1E0] px-4 py-3 flex items-center justify-between shrink-0">
          <h2 className="text-white font-semibold text-sm">{t.useCasesTitle}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              title={t.exportJson}
              className="text-white/80 hover:text-white text-xs border border-white/30 rounded px-2 py-0.5"
            >
              {t.exportJson}
            </button>
            <button
              onClick={() => importRef.current?.click()}
              title={t.importJson}
              className="text-white/80 hover:text-white text-xs border border-white/30 rounded px-2 py-0.5"
            >
              {t.importJson}
            </button>
            <input ref={importRef} type="file" accept=".json" className="hidden" onChange={handleImport} />
            <button
              onClick={() => setVisible(false)}
              className="text-white/70 hover:text-white text-lg leading-none ml-1"
            >
              ×
            </button>
          </div>
        </div>

        {/* Save current form */}
        <div className="border-b p-4 space-y-2 shrink-0">
          {saving ? (
            <>
              <input
                autoFocus
                className="w-full border rounded px-2 py-1.5 text-sm"
                placeholder={t.name}
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSave()}
              />
              <textarea
                className="w-full border rounded px-2 py-1.5 text-sm resize-none"
                placeholder={t.descriptionOptional}
                rows={2}
                value={saveDesc}
                onChange={(e) => setSaveDesc(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  onClick={handleSave}
                  disabled={!saveName.trim()}
                  className="flex-1 bg-[#00A1E0] text-white text-sm rounded py-1.5 hover:bg-[#0086b3] disabled:opacity-40"
                >
                  {t.save}
                </button>
                <button
                  onClick={() => { setSaving(false); setSaveName(""); setSaveDesc(""); }}
                  className="flex-1 border text-sm rounded py-1.5 hover:bg-gray-50"
                >
                  {t.cancel}
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setSaving(true)}
              className="w-full border border-dashed border-[#00A1E0] text-[#00A1E0] text-sm rounded py-2 hover:bg-blue-50"
            >
              {t.saveCurrentForm}
            </button>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {useCases.filter((uc) => (uc.tab || "order") === currentTab).length === 0 ? (
            <p className="text-gray-400 text-sm text-center mt-8 px-4">{t.noUseCases}</p>
          ) : (
            <ul className="divide-y">
              {useCases.filter((uc) => (uc.tab || "order") === currentTab).map((uc) => (
                <li key={uc.id} className="p-4 hover:bg-gray-50 group">
                  {editingId === uc.id ? (
                    <div className="space-y-2">
                      <input
                        autoFocus
                        className="w-full border rounded px-2 py-1.5 text-sm"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleEditSave(uc)}
                        placeholder={t.name}
                      />
                      <textarea
                        className="w-full border rounded px-2 py-1.5 text-sm resize-none"
                        rows={2}
                        value={editDesc}
                        onChange={(e) => setEditDesc(e.target.value)}
                        placeholder={t.descriptionOptional}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleEditSave(uc)}
                          disabled={!editName.trim()}
                          className="flex-1 bg-[#00A1E0] text-white text-sm rounded py-1 hover:bg-[#0086b3] disabled:opacity-40"
                        >
                          {t.save}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="flex-1 border text-sm rounded py-1 hover:bg-gray-50"
                        >
                          {t.cancel}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-gray-800 truncate">{uc.name}</p>
                        {uc.description && (
                          <p className="text-xs text-gray-400 mt-0.5 line-clamp-2">{uc.description}</p>
                        )}
                        <p className="text-xs text-gray-300 mt-1">
                          {new Date(uc.savedAt).toLocaleDateString("en-US", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button
                          onClick={() => handleRestore(uc)}
                          className="text-xs bg-[#00A1E0] text-white px-2 py-1 rounded hover:bg-[#0086b3]"
                          title="Restore"
                        >
                          ▶
                        </button>
                        <button
                          onClick={() => handleUpdate(uc)}
                          className="text-xs bg-green-500 text-white px-2 py-1 rounded hover:bg-green-600"
                          title="Update with current form"
                        >
                          ↑
                        </button>
                        <button
                          onClick={() => startEdit(uc)}
                          className="text-xs text-gray-300 hover:text-gray-600 px-1.5 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                          title="Edit name / description"
                        >
                          ✎
                        </button>
                        {confirmDelete === uc.id ? (
                          <>
                            <button
                              onClick={() => handleDelete(uc.id)}
                              className="text-xs bg-red-500 text-white px-2 py-1 rounded hover:bg-red-600"
                            >
                              ✓
                            </button>
                            <button
                              onClick={() => setConfirmDelete(null)}
                              className="text-xs border px-2 py-1 rounded hover:bg-gray-100"
                            >
                              ✗
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(uc.id)}
                            className="text-xs text-gray-300 hover:text-red-400 px-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Delete"
                          >
                            🗑
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}

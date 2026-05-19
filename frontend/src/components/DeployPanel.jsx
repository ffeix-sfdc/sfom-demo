import React, { useState, useEffect, useRef } from "react";
import api from "../api/client";

export default function DeployPanel({ onDeployed, open }) {
  const [status, setStatus] = useState(null);
  const [deploying, setDeploying] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [assigning, setAssigning] = useState(false);
  const [assignResult, setAssignResult] = useState(null);
  const [hiddenOnInit, setHiddenOnInit] = useState(false);
  const pollRef = useRef(null);

  const fetchStatus = async () => {
    try {
      const r = await api.get("/deploy/status");
      setStatus(r.data);
      if (r.data.all_deployed && r.data.permission_set_assigned) {
        setHiddenOnInit(true);
      }
      if (r.data.all_deployed) onDeployed?.();
    } catch {
      setStatus(null);
    }
  };

  const assignPermset = async () => {
    setAssigning(true);
    setAssignResult(null);
    try {
      const r = await api.post("/deploy/assign-permset");
      setAssignResult(r.data.already_assigned ? "already" : "ok");
    } catch {
      setAssignResult("error");
    } finally {
      setAssigning(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    fetchStatus();
    return () => clearTimeout(pollRef.current);
  }, [open]);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const r = await api.get(`/deploy/${jobId}`);
        if (cancelled) return;
        setJobStatus(r.data);
        if (r.data.done) {
          setDeploying(false);
          setJobId(null);
          if (r.data.success) await assignPermset();
          await fetchStatus();
          return;
        }
      } catch {
        if (!cancelled) setDeploying(false);
        return;
      }
      if (!cancelled) pollRef.current = setTimeout(poll, 2000);
    };

    pollRef.current = setTimeout(poll, 2000);
    return () => {
      cancelled = true;
      clearTimeout(pollRef.current);
    };
  }, [jobId]);

  const startDeploy = async () => {
    setDeploying(true);
    setJobStatus(null);
    setAssignResult(null);
    try {
      const r = await api.post("/deploy");
      setJobId(r.data.job_id);
    } catch (err) {
      setDeploying(false);
      const msg = err.response?.data?.detail || "Deploy failed";
      setJobStatus({ done: true, success: false, error: typeof msg === "string" ? msg : JSON.stringify(msg) });
    }
  };

  if (!status) return null;

  // Hide entirely if everything was already fine on init and no active deploy
  if (hiddenOnInit && !deploying && !jobId && !jobStatus) return null;

  // Already deployed — show compact row only if we just deployed (jobStatus exists) or permset needs action
  if (status.all_deployed) {
    const alreadyAssigned = status.permission_set_assigned || assignResult === "ok" || assignResult === "already";
    if (alreadyAssigned && !jobStatus) return null;
    return (
      <div className="border border-gray-200 bg-gray-50 rounded-lg p-3 flex items-center justify-between">
        <p className="text-xs text-gray-500">
          ✓ Objects deployed
          {alreadyAssigned && <span className="text-gray-400 ml-2">— permission set assigned</span>}
          {assignResult === "error" && <span className="text-red-500 ml-2">— permission set assignment failed</span>}
        </p>
        {!alreadyAssigned && (
          <button
            type="button"
            onClick={assignPermset}
            disabled={assigning}
            className="text-xs text-[#00A1E0] hover:underline disabled:opacity-50 ml-4 shrink-0"
          >
            {assigning ? "Assigning…" : "Assign permission set"}
          </button>
        )}
      </div>
    );
  }

  const progress = jobStatus?.total
    ? Math.round((parseInt(jobStatus.deployed || 0) / parseInt(jobStatus.total)) * 100)
    : null;

  return (
    <div className="border border-orange-200 bg-orange-50 rounded-lg p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className="text-orange-500 text-lg mt-0.5">⚠</span>
        <div className="flex-1">
          <p className="text-sm font-semibold text-orange-800">Objects not deployed on this org</p>
          <p className="text-xs text-orange-600 mt-0.5">
            Missing: {status.missing.join(", ")}
          </p>
        </div>
        <button
          type="button"
          onClick={startDeploy}
          disabled={deploying}
          className="shrink-0 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-medium px-4 py-1.5 rounded transition-colors"
        >
          {deploying ? "Deploying…" : "Deploy to Salesforce"}
        </button>
      </div>

      {jobStatus && (
        <div className="space-y-1.5">
          {progress !== null && (
            <div className="w-full bg-orange-100 rounded-full h-1.5">
              <div
                className="bg-orange-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
          <p className={`text-xs ${jobStatus.success ? "text-green-700" : jobStatus.done ? "text-red-600" : "text-orange-700"}`}>
            {jobStatus.success
              ? "✓ Deployment successful"
              : jobStatus.done
              ? `✗ ${jobStatus.error || "Deployment failed"}`
              : jobStatus.detail || `Status: ${jobStatus.status || "…"}`}
          </p>
          {assigning && <p className="text-xs text-gray-500">Assigning permission set…</p>}
          {assignResult === "ok" && <p className="text-xs text-green-700">✓ Permission set assigned to connected user</p>}
          {assignResult === "already" && <p className="text-xs text-gray-500">Permission set already assigned</p>}
          {assignResult === "error" && <p className="text-xs text-red-500">⚠ Could not assign permission set — assign manually</p>}
          {jobStatus.failures?.length > 0 && (
            <div className="mt-1 space-y-0.5">
              {jobStatus.failures.map((f, i) => (
                <p key={i} className="text-xs text-red-600 font-mono">
                  {f.component}: {f.problem}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

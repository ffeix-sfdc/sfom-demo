import React, { useState, useEffect, useRef } from "react";
import { cachedGet } from "../api/orgCache";

function FilterDropdown({ items, filter, onSelect, placeholder }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filtered = filter.length >= 1
    ? items.filter((i) =>
        i.label.toLowerCase().includes(filter.toLowerCase()) ||
        i.code.toLowerCase().includes(filter.toLowerCase())
      )
    : items;

  return (
    <div ref={ref} className="relative">
      <input
        className="w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-[#00A1E0]"
        placeholder={placeholder}
        value={filter}
        onChange={(e) => { onSelect(null, e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 top-full mt-0.5 bg-white border rounded shadow-lg max-h-48 overflow-y-auto">
          {filtered.slice(0, 80).map((item) => (
            <button
              key={item.code}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onSelect(item); setOpen(false); }}
              className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 border-b last:border-0 flex justify-between"
            >
              <span>{item.label}</span>
              <span className="text-gray-400 font-mono">{item.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function CountryStateSelector({
  countryCode, stateCode,
  onCountryChange, onStateChange,
  labelCountry = "Country", labelState = "State",
  labelCls = "block text-xs font-medium text-gray-600 mb-0.5",
  className = "grid grid-cols-2 gap-3",
  showState = true,
}) {
  const [countries, setCountries] = useState([]);
  const [states, setStates] = useState([]);
  const [countryFilter, setCountryFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  // Load countries once — cachedGet deduplicates concurrent calls via shared Promise
  useEffect(() => {
    cachedGet("/orders/countries").then(setCountries).catch(() => {});
  }, []);

  // Sync display labels when codes change externally (e.g. account select / restore)
  useEffect(() => {
    if (!countryCode) { setCountryFilter(""); return; }
    const match = countries.find((c) => c.code === countryCode);
    setCountryFilter(match ? `${match.label} (${match.code})` : countryCode);
  }, [countryCode, countries]);

  useEffect(() => {
    if (!stateCode) { setStateFilter(""); return; }
    const match = states.find((s) => s.code === stateCode);
    setStateFilter(match ? `${match.label} (${match.code})` : stateCode);
  }, [stateCode, states]);

  // Load states when country changes
  useEffect(() => {
    if (!countryCode) { setStates([]); return; }
    cachedGet(`/orders/states?country=${encodeURIComponent(countryCode)}`).then(setStates).catch(() => {});
  }, [countryCode]);

  const handleCountrySelect = (item, rawFilter) => {
    if (item) {
      setCountryFilter(`${item.label} (${item.code})`);
      onCountryChange(item.code, item.label);
      onStateChange("", ""); // reset state when country changes
      setStateFilter("");
    } else {
      setCountryFilter(rawFilter);
      // If user clears field, clear the code too
      if (!rawFilter) onCountryChange("", "");
    }
  };

  const handleStateSelect = (item, rawFilter) => {
    if (item) {
      setStateFilter(`${item.label} (${item.code})`);
      onStateChange(item.code, item.label);
    } else {
      setStateFilter(rawFilter);
      if (!rawFilter) onStateChange("", "");
    }
  };

  return (
    <div className={className}>
      <div>
        <label className={labelCls}>{labelCountry}</label>
        <FilterDropdown
          items={countries}
          filter={countryFilter}
          onSelect={handleCountrySelect}
          placeholder="Type to filter…"
        />
      </div>
      {showState && (
        <div>
          <label className={labelCls}>{labelState}</label>
          <FilterDropdown
            items={states}
            filter={stateFilter}
            onSelect={handleStateSelect}
            placeholder={countryCode ? "Type to filter…" : "Select country first"}
          />
        </div>
      )}
    </div>
  );
}

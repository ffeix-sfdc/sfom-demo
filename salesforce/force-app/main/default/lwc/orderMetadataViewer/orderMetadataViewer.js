import { LightningElement, api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';
import ORDER_METADATA_FIELD from '@salesforce/schema/OrderSummary.OrderMetadata__c';

const FIELDS = [ORDER_METADATA_FIELD];

const DAY_LABELS = {
    monday: 'Mon', tuesday: 'Tue', wednesday: 'Wed',
    thursday: 'Thu', friday: 'Fri', saturday: 'Sat', sunday: 'Sun'
};

export default class OrderMetadataViewer extends LightningElement {
    @api recordId;

    _metadata = null;
    _error = null;

    @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
    wiredRecord({ data, error }) {
        if (data) {
            const raw = getFieldValue(data, ORDER_METADATA_FIELD);
            if (raw) {
                try {
                    this._metadata = JSON.parse(raw);
                } catch (e) {
                    this._error = 'Invalid JSON in OrderMetadata__c';
                }
            } else {
                this._metadata = null;
            }
        } else if (error) {
            this._error = error.body?.message || 'Error loading record';
        }
    }

    get hasMetadata() {
        return !!this._metadata && Object.keys(this._metadata).length > 0;
    }

    get error() {
        return this._error;
    }

    // ── Pickup Slots ─────────────────────────────────────────────────────────

    get hasPickupSlots() {
        return this._metadata?.pickupSlots?.length > 0;
    }

    get pickupSlots() {
        return (this._metadata?.pickupSlots || []).map((s, i) => ({
            key: `ps-${i}`,
            deliveryGroupIndex: s.deliveryGroupIndex,
            locationName: s.locationName || s.locationExtRef || '—',
            locationExtRef: s.locationExtRef,
            pickupDate: this._formatDate(s.pickupTime),
            pickupTime: this._formatTime(s.pickupTime),
        }));
    }

    // ── TMS Bookings ─────────────────────────────────────────────────────────

    get hasTmsBookings() {
        return this._metadata?.tmsBookings?.length > 0;
    }

    get tmsBookings() {
        return (this._metadata?.tmsBookings || []).map((b, i) => ({
            key: `tb-${i}`,
            deliveryGroupIndex: b.deliveryGroupIndex,
            shippingMethodName: b.shippingMethodName || b.shippingMethodRef || '—',
            deliveryDate: this._formatDateStr(b.deliveryDate),
            window: b.windowEnd ? `${b.windowStart} – ${b.windowEnd}` : b.windowStart,
        }));
    }

    // ── Pickup Points ─────────────────────────────────────────────────────────

    get hasPickupPoints() {
        return this._metadata?.pickupPoints?.length > 0;
    }

    get pickupPoints() {
        return (this._metadata?.pickupPoints || []).map((p, i) => ({
            key: `pp-${i}`,
            deliveryGroupIndex: p.deliveryGroupIndex,
            id: p.pickupPointId,
            carrier: p.carrier || '—',
            name: p.name || p.pickupPointId,
            address: [p.address, p.postalCode, p.city, p.country].filter(Boolean).join(', '),
        }));
    }

    // ── Gift Card ─────────────────────────────────────────────────────────────

    get hasGiftCard() {
        return !!this._metadata?.giftCard;
    }

    get giftCard() {
        const gc = this._metadata?.giftCard;
        if (!gc) return null;
        return {
            number: gc.giftCardNumber,
            maskedNumber: gc.giftCardNumber
                ? `••••${gc.giftCardNumber.slice(-4)}`
                : '—',
            amount: gc.amount != null ? gc.amount.toFixed(2) : '—',
        };
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    _formatDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString('en-GB', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
            });
        } catch { return iso; }
    }

    _formatTime(iso) {
        if (!iso) return '';
        try {
            return new Date(iso).toLocaleTimeString('en-GB', {
                hour: '2-digit', minute: '2-digit'
            });
        } catch { return ''; }
    }

    _formatDateStr(dateStr) {
        if (!dateStr) return '—';
        try {
            const [y, m, d] = dateStr.split('-').map(Number);
            return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
                weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
            });
        } catch { return dateStr; }
    }
}

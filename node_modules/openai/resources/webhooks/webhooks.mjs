// File generated from our OpenAPI spec by Castiron. See CONTRIBUTING.md for details.
var _Webhooks_instances, _Webhooks_validateSecret, _Webhooks_getRequiredHeader;
import { __classPrivateFieldGet } from "../../internal/tslib.mjs";
import { APIResource } from "../../core/resource.mjs";
import { buildHeaders } from "../../internal/headers.mjs";
import { verifyWebhookSignature, webhookSignatureRequiresSigning } from "../../lib/webhook-signature.mjs";
export class Webhooks extends APIResource {
    constructor() {
        super(...arguments);
        _Webhooks_instances.add(this);
    }
    /**
     * Validates that the given payload was sent by OpenAI and parses the payload.
     */
    async unwrap(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
        await this.verifySignature(payload, headers, secret, tolerance);
        return JSON.parse(payload);
    }
    /**
     * Validates whether or not the webhook payload was sent by OpenAI.
     *
     * An error will be raised if the webhook payload was not sent by OpenAI.
     *
     * @param payload - The webhook payload
     * @param headers - The webhook headers
     * @param secret - The webhook secret (optional, will use client secret if not provided)
     * @param tolerance - Maximum age of the webhook in seconds (default: 300 = 5 minutes)
     */
    async verifySignature(payload, headers, secret = this._client.webhookSecret, tolerance = 300) {
        if (typeof crypto === 'undefined' ||
            typeof crypto.subtle?.importKey !== 'function' ||
            typeof crypto.subtle.verify !== 'function') {
            throw new Error('Webhook signature verification is only supported when the `crypto` global is defined');
        }
        __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_validateSecret).call(this, secret);
        const headersObj = buildHeaders([headers]).values;
        const signatureHeader = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, 'webhook-signature');
        const timestamp = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, 'webhook-timestamp');
        const webhookId = __classPrivateFieldGet(this, _Webhooks_instances, "m", _Webhooks_getRequiredHeader).call(this, headersObj, 'webhook-id');
        if (webhookSignatureRequiresSigning(signatureHeader) && typeof crypto.subtle.sign !== 'function') {
            throw new Error('Webhook signature verification is only supported when the `crypto` global is defined');
        }
        return await verifyWebhookSignature(payload, signatureHeader, timestamp, webhookId, secret, tolerance);
    }
}
_Webhooks_instances = new WeakSet(), _Webhooks_validateSecret = function _Webhooks_validateSecret(secret) {
    if (typeof secret !== 'string' || secret.length === 0) {
        throw new Error(`The webhook secret must either be set using the env var, OPENAI_WEBHOOK_SECRET, on the client class, OpenAI({ webhookSecret: '123' }), or passed to this function`);
    }
}, _Webhooks_getRequiredHeader = function _Webhooks_getRequiredHeader(headers, name) {
    if (!headers) {
        throw new Error(`Headers are required`);
    }
    const value = headers.get(name);
    if (value === null || value === undefined) {
        throw new Error(`Missing required header: ${name}`);
    }
    return value;
};
//# sourceMappingURL=webhooks.mjs.map
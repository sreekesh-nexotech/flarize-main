/**
 * SALES WIZARD — pure error mapper (Phase 2 · P2 · 2026-09-02).
 *
 * Translates orchestrator + preflight error codes into customer-friendly
 * business messages. Zero DOM references. Dual-exported for browser + Node.
 *
 * The Sales user must NEVER see raw engine enum names in the primary
 * message. Raw code + detail remain available under a "Technical details"
 * expander (see sales-wizard.js).
 */
'use strict';
(function () {

  function translateOrchestratorError(code, detail) {
    const raw = { rawCode: code || null, rawDetail: detail || null };
    switch (code) {
      case 'NO_APPROVED_PACKAGE':
        return Object.assign({}, raw, {
          businessMessage: 'This system configuration is not yet approved for sales. Engineering approval is required before it can be sold.',
          owner: 'Engineering',
        });
      case 'ENGINEERING_BLOCKED':
        return Object.assign({}, raw, {
          businessMessage: 'Engineering validation failed for this configuration. Please contact Engineering.',
          owner: 'Engineering',
        });
      case 'COST_INCOMPLETE': {
        var heads = detail && Array.isArray(detail.blockedHeads) ? detail.blockedHeads.join(', ') : '';
        var suffix = heads ? ' (' + heads + ')' : '';
        return Object.assign({}, raw, {
          businessMessage: 'Some project cost information is not yet configured' + suffix + '. Procurement prices, rate card or transport values are missing.',
          owner: 'Procurement / Admin',
        });
      }
      case 'PRICING_REJECTED':
      case 'MARGIN_NOT_CONFIGURED':
      case 'MARGIN_BELOW_MINIMUM':
      case 'MARGIN_CONFIG_INVALID':
      case 'GST_NOT_CONFIGURED':
      case 'GST_REGIME_INVALID':
        return Object.assign({}, raw, {
          businessMessage: 'Commercial configuration is missing or below approval threshold. Please contact Admin.',
          owner: 'Admin',
        });
      case 'GENERATION_BLOCKED': {
        var failed = detail && Array.isArray(detail.failedChecks) ? detail.failedChecks : [];
        var msg = 'Quotation cannot be generated in the current state.';
        var specific = [];
        for (var i = 0; i < failed.length; i++) {
          var c = failed[i];
          if (c === 'CUSTOMER_DATA') specific.push('customer information');
          else if (c === 'SYSTEM_CONFIGURATION') specific.push('system configuration');
          else if (c === 'BOM_EXISTS' || c === 'BOM_LOCKED') specific.push('approved BOM');
          else if (c === 'ENGINEERING_VALIDATION') specific.push('engineering validation');
          else if (c === 'COMMERCIAL_SNAPSHOT') specific.push('commercial snapshot');
          else if (c === 'SUBSIDY_RESOLVED') specific.push('subsidy treatment');
          else if (c === 'QUOTATION_METADATA') specific.push('quotation metadata');
        }
        if (specific.length) msg = 'Quotation is not ready — missing: ' + specific.join(', ') + '.';
        return Object.assign({}, raw, { businessMessage: msg, owner: 'Sales / Admin' });
      }
      case 'MISSING_INPUT':
        return Object.assign({}, raw, {
          businessMessage: 'Some required information is missing. Please review the wizard steps.',
          owner: 'Sales',
        });
      case 'ROLE_DENIED':
        return Object.assign({}, raw, {
          businessMessage: 'Your role does not permit this action. Please contact Admin.',
          owner: 'Admin',
        });
      case 'ORCHESTRATION_FAILED':
      default:
        return Object.assign({}, raw, {
          businessMessage: 'Unable to complete this quotation. Please contact support.',
          owner: 'Support',
        });
    }
  }

  function translatePreflightBlockers(blockers) {
    if (!Array.isArray(blockers) || blockers.length === 0) return null;
    var owners = { PROJECT_HEAD: 'Engineering', ENGINEERING: 'Engineering', PROCUREMENT: 'Procurement', ADMIN: 'Admin' };
    var first = blockers[0];
    return {
      businessMessage: first.message || 'Configuration not ready for sales.',
      owner: owners[first.owner] || first.owner || 'Support',
      rawCode: first.code,
      rawDetail: blockers,
    };
  }

  var api = { translateOrchestratorError: translateOrchestratorError, translatePreflightBlockers: translatePreflightBlockers };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.SalesWizardErrors = api;
})();

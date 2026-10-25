/**
 * FlyRank Embeddable Lead-Capture Widget Engine v1.0.0
 * Pure vanilla JavaScript runtime - Dependency-free, secure, and accessible.
 * 
 * Features:
 * - Dynamic configuration loading via widget ID
 * - Accessible semantic HTML forms with ARIA live regions
 * - Isolated Shadow DOM rendering (prevents host CSS collisions)
 * - Built-in honeypot and rendering timestamp telemetry
 * - Client-side validation and responsive state transitions
 * - Zero eval() and safe DOM manipulation (XSS-proof)
 */
(function () {
  'use strict';

  // Prevent multiple executions for the same script instance
  if (window.__flyrank_widget_v1_loaded) return;
  window.__flyrank_widget_v1_loaded = true;

  /**
   * Helper to safely create an element with attributes and text
   */
  function createElement(tag, attrs, text) {
    var el = document.createElement(tag);
    if (attrs) {
      for (var key in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, key)) {
          if (key === 'className') {
            el.className = attrs[key];
          } else if (key === 'style' && typeof attrs[key] === 'object') {
            for (var s in attrs[key]) {
              el.style[s] = attrs[key][s];
            }
          } else {
            el.setAttribute(key, attrs[key]);
          }
        }
      }
    }
    if (text !== undefined && text !== null) {
      el.textContent = text;
    }
    return el;
  }

  /**
   * Core Widget Renderer
   */
  function renderWidget(config, widgetId, baseUrl, mountContainer) {
    var renderedAt = Date.now();
    var themeColor = (config.display && config.display.theme_color) || '#2563eb';
    var position = (config.display && config.display.position) || 'bottom-right';

    // Locate or create container
    var container = mountContainer;
    if (!container) {
      var existing = document.getElementById('flyrank-widget') ||
                     document.getElementById('flyrank-widget-' + widgetId) ||
                     document.querySelector('[data-flyrank-widget]');
      if (existing) {
        container = existing;
      } else {
        container = createElement('div', {
          id: 'flyrank-widget-' + widgetId,
          'data-flyrank-container': 'true'
        });

        // Floating positioning
        if (position === 'bottom-right') {
          container.style.position = 'fixed';
          container.style.bottom = '20px';
          container.style.right = '20px';
          container.style.zIndex = '999999';
        } else if (position === 'bottom-left') {
          container.style.position = 'fixed';
          container.style.bottom = '20px';
          container.style.left = '20px';
          container.style.zIndex = '999999';
        } else if (position === 'top-right') {
          container.style.position = 'fixed';
          container.style.top = '20px';
          container.style.right = '20px';
          container.style.zIndex = '999999';
        } else {
          container.style.maxWidth = '420px';
          container.style.width = '100%';
          container.style.margin = '20px auto';
        }

        document.body.appendChild(container);
      }
    }

    // Isolate styles with Shadow DOM if supported
    var root = (container.attachShadow && typeof container.attachShadow === 'function')
      ? container.attachShadow({ mode: 'open' })
      : container;

    // Clear any previous render
    while (root.firstChild) {
      root.removeChild(root.firstChild);
    }

    // Component Stylesheet
    var style = createElement('style');
    style.textContent = [
      ':host, .flyrank-card {',
      '  box-sizing: border-box;',
      '  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;',
      '  color: #1e293b;',
      '}',
      '.flyrank-card {',
      '  background: #ffffff;',
      '  border: 1px solid #e2e8f0;',
      '  border-radius: 12px;',
      '  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);',
      '  padding: 24px;',
      '  width: 100%;',
      '  max-width: 360px;',
      '  position: relative;',
      '}',
      '.flyrank-header { margin-bottom: 16px; }',
      '.flyrank-title {',
      '  margin: 0 0 6px 0;',
      '  font-size: 18px;',
      '  font-weight: 700;',
      '  color: #0f172a;',
      '}',
      '.flyrank-description {',
      '  margin: 0;',
      '  font-size: 13px;',
      '  color: #64748b;',
      '  line-height: 1.4;',
      '}',
      '.flyrank-field-group {',
      '  margin-bottom: 14px;',
      '}',
      '.flyrank-label {',
      '  display: block;',
      '  font-size: 13px;',
      '  font-weight: 600;',
      '  color: #334155;',
      '  margin-bottom: 6px;',
      '}',
      '.flyrank-input {',
      '  width: 100%;',
      '  box-sizing: border-box;',
      '  padding: 10px 12px;',
      '  font-size: 14px;',
      '  border: 1px solid #cbd5e1;',
      '  border-radius: 8px;',
      '  background: #ffffff;',
      '  color: #0f172a;',
      '  transition: border-color 0.15s ease, box-shadow 0.15s ease;',
      '}',
      '.flyrank-input:focus {',
      '  outline: none;',
      '  border-color: ' + themeColor + ';',
      '  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);',
      '}',
      '.flyrank-submit-btn {',
      '  display: block;',
      '  width: 100%;',
      '  box-sizing: border-box;',
      '  padding: 12px 16px;',
      '  font-size: 14px;',
      '  font-weight: 600;',
      '  color: #ffffff;',
      '  background-color: ' + themeColor + ';',
      '  border: none;',
      '  border-radius: 8px;',
      '  cursor: pointer;',
      '  transition: opacity 0.2s ease, transform 0.1s ease;',
      '}',
      '.flyrank-submit-btn:hover:not(:disabled) {',
      '  opacity: 0.92;',
      '}',
      '.flyrank-submit-btn:active:not(:disabled) {',
      '  transform: scale(0.99);',
      '}',
      '.flyrank-submit-btn:disabled {',
      '  opacity: 0.6;',
      '  cursor: not-allowed;',
      '}',
      '.flyrank-status-message {',
      '  font-size: 13px;',
      '  margin-bottom: 12px;',
      '  padding: 0;',
      '  display: none;',
      '}',
      '.flyrank-status-message.flyrank-error {',
      '  display: block;',
      '  color: #b91c1c;',
      '  background: #fef2f2;',
      '  border: 1px solid #fecaca;',
      '  border-radius: 6px;',
      '  padding: 8px 12px;',
      '}',
      '.flyrank-success-state {',
      '  text-align: center;',
      '  padding: 12px 0;',
      '}',
      '.flyrank-success-icon {',
      '  width: 44px;',
      '  height: 44px;',
      '  line-height: 44px;',
      '  border-radius: 50%;',
      '  background: #dcfce7;',
      '  color: #15803d;',
      '  font-size: 22px;',
      '  margin: 0 auto 12px auto;',
      '}',
      '.flyrank-success-title {',
      '  margin: 0 0 6px 0;',
      '  font-size: 17px;',
      '  font-weight: 700;',
      '  color: #0f172a;',
      '}',
      '.flyrank-success-text {',
      '  margin: 0;',
      '  font-size: 13px;',
      '  color: #64748b;',
      '}'
    ].join('\n');
    root.appendChild(style);

    // Card Container
    var card = createElement('div', { className: 'flyrank-card' });

    // Header section
    if (config.title || config.description) {
      var header = createElement('div', { className: 'flyrank-header' });
      if (config.title) {
        var title = createElement('h3', { className: 'flyrank-title' }, config.title);
        header.appendChild(title);
      }
      if (config.description) {
        var desc = createElement('p', { className: 'flyrank-description' }, config.description);
        header.appendChild(desc);
      }
      card.appendChild(header);
    }

    // Form element
    var form = createElement('form', {
      className: 'flyrank-form',
      novalidate: 'true',
      'aria-label': config.title || 'Lead Capture Form'
    });

    // Form fields
    var fields = config.fields || [];
    for (var i = 0; i < fields.length; i++) {
      var fld = fields[i];
      var group = createElement('div', { className: 'flyrank-field-group' });
      var fieldId = 'flyrank-' + widgetId + '-' + fld.name;

      var label = createElement('label', {
        className: 'flyrank-label',
        'for': fieldId
      }, fld.label || fld.name);

      if (fld.required) {
        var reqStar = createElement('span', {
          style: { color: '#ef4444', marginLeft: '3px' },
          'aria-hidden': 'true'
        }, '*');
        label.appendChild(reqStar);
      }
      group.appendChild(label);

      var input;
      if (fld.type === 'textarea') {
        input = createElement('textarea', {
          id: fieldId,
          name: fld.name,
          className: 'flyrank-input',
          rows: '3'
        });
      } else {
        var inputType = fld.type === 'number' ? 'number' : (fld.type === 'email' ? 'email' : 'text');
        input = createElement('input', {
          id: fieldId,
          name: fld.name,
          type: inputType,
          className: 'flyrank-input'
        });
      }

      if (fld.required) {
        input.setAttribute('required', 'true');
        input.setAttribute('aria-required', 'true');
      }

      if (fld.type === 'email') {
        input.setAttribute('autocomplete', 'email');
      } else if (fld.name === 'name' || fld.name === 'full_name') {
        input.setAttribute('autocomplete', 'name');
      }

      group.appendChild(input);
      form.appendChild(group);
    }

    // Hidden Honeypot Field for anti-spam detection
    var honeypot = createElement('input', {
      type: 'text',
      name: '_hp_company',
      tabindex: '-1',
      autocomplete: 'off',
      'aria-hidden': 'true',
      style: {
        display: 'none',
        position: 'absolute',
        left: '-9999px',
        opacity: '0'
      }
    });
    form.appendChild(honeypot);

    // Live accessible status container for error/loading messages
    var statusMsg = createElement('div', {
      className: 'flyrank-status-message',
      role: 'status',
      'aria-live': 'polite'
    });
    form.appendChild(statusMsg);

    // Submit button
    var submitBtn = createElement('button', {
      type: 'submit',
      className: 'flyrank-submit-btn',
      style: {
        backgroundColor: themeColor
      }
    }, config.button_text || 'Submit');
    form.appendChild(submitBtn);

    card.appendChild(form);
    root.appendChild(card);

    // Form Submit Event Handler
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      statusMsg.textContent = '';
      statusMsg.className = 'flyrank-status-message';

      var payload = {};
      var hasError = false;

      // Basic client-side validation
      for (var j = 0; j < fields.length; j++) {
        var curField = fields[j];
        var curInput = form.querySelector('[name="' + curField.name + '"]');
        if (!curInput) continue;

        var val = curInput.value.trim();

        if (curField.required && !val) {
          statusMsg.textContent = (curField.label || curField.name) + ' is required.';
          statusMsg.className = 'flyrank-status-message flyrank-error';
          curInput.focus();
          hasError = true;
          return;
        }

        if (curField.type === 'email' && val) {
          var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(val)) {
            statusMsg.textContent = 'Please enter a valid email address.';
            statusMsg.className = 'flyrank-status-message flyrank-error';
            curInput.focus();
            hasError = true;
            return;
          }
        }

        payload[curField.name] = curField.type === 'number' ? Number(val) : val;
      }

      if (hasError) return;

      // Set Loading State
      submitBtn.disabled = true;
      var originalBtnText = submitBtn.textContent;
      submitBtn.textContent = 'Submitting...';

      var requestPayload = {
        widget_id: widgetId,
        payload: payload,
        _hp_company: honeypot.value,
        _rendered_at: renderedAt
      };

      var submissionUrl = baseUrl + '/api/v1/submissions';

      fetch(submissionUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestPayload)
      })
        .then(function (res) {
          return res.json().then(function (json) {
            return { ok: res.ok, status: res.status, data: json };
          });
        })
        .then(function (result) {
          if (result.ok && result.status === 201) {
            // Render Inline Success State
            form.style.display = 'none';

            var successState = createElement('div', {
              className: 'flyrank-success-state',
              role: 'alert'
            });

            var icon = createElement('div', { className: 'flyrank-success-icon' }, '✓');
            var successTitle = createElement('h4', { className: 'flyrank-success-title' }, 'Thank you!');
            var successText = createElement('p', { className: 'flyrank-success-text' }, 'Your submission has been received.');

            successState.appendChild(icon);
            successState.appendChild(successTitle);
            successState.appendChild(successText);

            card.appendChild(successState);
          } else {
            var msg = (result.data && (result.data.message || result.data.error)) || 'Submission failed. Please try again.';
            statusMsg.textContent = msg;
            statusMsg.className = 'flyrank-status-message flyrank-error';
            submitBtn.disabled = false;
            submitBtn.textContent = originalBtnText;
          }
        })
        .catch(function (err) {
          statusMsg.textContent = 'Network connection error. Please try again later.';
          statusMsg.className = 'flyrank-status-message flyrank-error';
          submitBtn.disabled = false;
          submitBtn.textContent = originalBtnText;
        });
    });

    return {
      container: container,
      root: root,
      form: form,
      card: card
    };
  }

  /**
   * Public Init Function
   */
  function init(widgetId, baseUrl, mountContainer) {
    if (!widgetId) {
      console.error('[FlyRank Widget] No widget ID provided.');
      return;
    }

    var base = baseUrl || window.location.origin;
    var configUrl = base + '/api/v1/widgets/' + widgetId + '/config';

    fetch(configUrl)
      .then(function (res) {
        if (!res.ok) {
          throw new Error('Failed to load widget configuration (HTTP ' + res.status + ')');
        }
        return res.json();
      })
      .then(function (json) {
        var config = json.data || json;
        renderWidget(config, widgetId, base, mountContainer);
      })
      .catch(function (err) {
        console.warn('[FlyRank Widget]', err.message);
      });
  }

  // Auto-Initialization based on currently executing script tag
  var currentScript = document.currentScript;
  if (!currentScript) {
    var scripts = document.getElementsByTagName('script');
    for (var s = scripts.length - 1; s >= 0; s--) {
      if (scripts[s].src && scripts[s].src.indexOf('widget.v1.js') !== -1) {
        currentScript = scripts[s];
        break;
      }
    }
  }

  if (currentScript && currentScript.src) {
    try {
      var scriptUrl = new URL(currentScript.src, window.location.href);
      var widgetIdParam = scriptUrl.searchParams.get('id') || currentScript.getAttribute('data-widget-id');
      var baseUrlParam = scriptUrl.origin;

      if (widgetIdParam) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', function () {
            init(widgetIdParam, baseUrlParam);
          });
        } else {
          init(widgetIdParam, baseUrlParam);
        }
      }
    } catch (e) {
      console.warn('[FlyRank Widget] Auto-init failed:', e.message);
    }
  }

  // Expose for programmatic or test usage
  window.FlyRankWidget = {
    init: init,
    renderWidget: renderWidget
  };
})();

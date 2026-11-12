(function () {
    'use strict';
    const api = window.CityVet;
    const form = document.getElementById('authForm');
    const mode = document.body.dataset.mode;
    const notice = document.getElementById('authNotice');
    const submit = document.getElementById('submitAuth');
    const roleSelect = document.getElementById('role');
    const roleHelper = document.getElementById('roleHelper');

    function show(message, kind='error') {
        notice.textContent = message;
        notice.hidden = !message;
        notice.className = 'AUTH_NOTICE ' + (kind === 'success' ? 'is-success' : 'is-error');
    }
    function busy(value) {
        submit.disabled = value;
        submit.textContent = value ? 'Please wait…' : (mode === 'register' ? 'Create account' : 'Sign in');
    }
    document.querySelectorAll('[data-toggle-password]').forEach(button => {
        button.addEventListener('click', () => {
            const input = document.getElementById(button.dataset.togglePassword);
            input.type = input.type === 'password' ? 'text' : 'password';
            button.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
            button.querySelector('i').className = input.type === 'password' ? 'fa-regular fa-eye' : 'fa-regular fa-eye-slash';
        });
    });
    function updateRoleHelp() {
        if (!roleSelect || !roleHelper) return;
        const role = roleSelect.value;
        roleHelper.textContent = mode === 'register'
            ? (role === 'officer' ? 'Field Officer accounts require email verification and CVO approval. You cannot register as Admin.' : 'Pet Owners receive a verification email to activate their account.')
            : (role === 'admin' ? 'Administrator access requires an Admin Team membership.'
            : role === 'officer' ? 'Field Officer access requires an approved Team membership.'
            : 'Use the email and password you registered with.');
    }
    if (roleSelect) {
        roleSelect.addEventListener('change', updateRoleHelp);
        updateRoleHelp();
    }
    function isNetworkErrorText(text) {
        return /failed to fetch|networkerror|network request failed|load failed|offline|connection/i.test(String(text || ''));
    }
    function checkExistingSession() {
        if (!api.ready) return;
        api.context().then(async c => {
            if (notice && !notice.hidden && isNetworkErrorText(notice.textContent)) show('');
            if (c.user.prefs?.requireEmailVerification && !c.user.emailVerification) {
                await api.logout();
                return;
            }
            if (c.role === 'pending_officer') {
                await api.logout();
                show('Your Field Officer account is awaiting CVO approval. You cannot sign in until an Administrator approves it.');
                return;
            }
            window.location.replace(api.destination(c.role));
        }).catch(error => {
            if (error?.code === 401 && notice && !notice.hidden && isNetworkErrorText(notice.textContent)) {
                show('');
            } else if (error?.code !== 401) {
                show(api.readableError(error));
            }
        });
    }
    window.addEventListener('online', () => {
        if (notice && !notice.hidden && isNetworkErrorText(notice.textContent)) show('');
        checkExistingSession();
    });
    form.addEventListener('input', () => {
        if (notice && !notice.hidden && isNetworkErrorText(notice.textContent)) show('');
    });
    const params = new URLSearchParams(window.location.search);
    if (params.get('officer') === 'pending') {
        show('Field Officer account created! Please verify your email via the link sent to your inbox. Sign-in will be available after Administrator approval.', 'success');
    } else if (params.get('verify') === 'sent') {
        const targetEmail = params.get('email') || 'your email address';
        show(`Account created! A verification email has been sent to ${targetEmail}. Please click the link in your email to verify your account before signing in.`, 'success');
    }

    if (!api.ready) {
        show('Set your endpoint and project ID in scripts/config.js first.');
    } else {
        const verifyUserId = params.get('userId');
        const verifySecret = params.get('secret');
        if (verifyUserId && verifySecret) {
            show('Verifying your email address…', 'success');
            api.verifyEmail(verifyUserId, verifySecret)
                .then(() => {
                    window.history.replaceState({}, document.title, window.location.pathname);
                    show('Email verified successfully! You may now sign in.', 'success');
                })
                .catch(error => {
                    show('Email verification could not be completed: ' + api.readableError(error));
                });
        } else {
            checkExistingSession();
        }
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        show('');
        if (!api.ready) return show('Configure scripts/config.js before signing in.');
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const selectedRole = roleSelect ? roleSelect.value : '';
        if (!email || !password) return show('Enter your email address and password.');
        if (mode === 'register') {
            const name = document.getElementById('fullName').value.trim();
            const confirm = document.getElementById('confirmPassword').value;
            if (name.length < 2) return show('Enter your full name.');
            if (password.length < 8) return show('Use at least 8 characters for your password.');
            if (password !== confirm) return show('Passwords do not match.');
            if (!document.getElementById('agreement').checked) return show('Please acknowledge the privacy notice.');
        }
        busy(true);
        try {
            if (mode === 'register') {
                const result = await api.register({
                    name: document.getElementById('fullName').value.trim(), email, password, requestedRole: selectedRole || 'owner'
                });
                if (result.role === 'pending_officer') {
                    try { await api.logout(); } catch {}
                    window.location.replace('./login.html?officer=pending');
                } else {
                    window.location.replace('./login.html?verify=sent&email=' + encodeURIComponent(email));
                }
            } else {
                await api.login(email, password);
                const c = await api.context();
                if (c.user.prefs?.requireEmailVerification && !c.user.emailVerification) {
                    try { await api.sendVerificationEmail(new URL('./login.html', window.location.href).href); } catch {}
                    await api.logout();
                    show('Please verify your email address before signing in. A verification link has been sent to ' + email + '.');
                    return;
                }
                if (c.role === 'pending_officer') {
                    await api.logout();
                    show('Field Officer approval is still pending. An Administrator must verify your account before you can sign in.');
                    return;
                }
                window.location.replace(api.destination(c.role));
            }
        } catch (error) {
            show(api.readableError(error));
        } finally {
            busy(false);
        }
    });
})();

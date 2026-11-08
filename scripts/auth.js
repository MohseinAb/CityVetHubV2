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
        const role = roleSelect.value;
        roleHelper.textContent = mode === 'register'
            ? (role === 'officer' ? 'Field Officer accounts require CVO approval. You cannot register as Admin.' : 'Pet Owners can register and sign in immediately.')
            : (role === 'admin' ? 'Administrator access requires an Appwrite Admin Team membership.'
            : role === 'officer' ? 'Field Officer access requires an approved Team membership.'
            : 'Use the email and password you registered with.');
    }
    roleSelect.addEventListener('change', updateRoleHelp);
    updateRoleHelp();
    if(new URLSearchParams(window.location.search).get('officer')==='pending')show('Field Officer account created. Sign-in will be available after Administrator approval.','success');

    if (!api.ready) {
        show('Set your Appwrite endpoint and project ID in scripts/config.js first.');
    } else {
        api.context().then(async c => {if(c.role==='pending_officer'){await api.logout();show('Your Field Officer account is awaiting CVO approval. You cannot sign in until an Administrator approves it.');return;}window.location.replace(api.destination(c.role));})
            .catch(error => {
                // 401 means not signed in; other errors should be visible.
                if (error?.code !== 401) show(api.readableError(error));
            });
    }

    form.addEventListener('submit', async event => {
        event.preventDefault();
        show('');
        if (!api.ready) return show('Configure scripts/config.js before signing in.');
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const selectedRole = roleSelect.value;
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
                    name: document.getElementById('fullName').value.trim(), email, password, requestedRole: selectedRole
                });
                if(result.role==='pending_officer'){
                    try { await api.logout(); } catch {}
                    window.location.replace('./login.html?officer=pending');
                } else window.location.replace(api.destination(result.role));
            } else {
                await api.login(email, password);
                const c = await api.context();
                if(c.role==='pending_officer'){
                    await api.logout();
                    show('Field Officer approval is still pending. An Administrator must verify your account before you can sign in.');
                    return;
                }
                if (selectedRole !== c.role) {
                    await api.logout();
                    show('This account does not have access as ' + roleSelect.options[roleSelect.selectedIndex].text + '. Select the correct role, or ask a CVO administrator for approval.');
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

(async function () {
    const api = window.CityVet;
    const msg = document.getElementById('pendingMessage');
    const check = document.getElementById('checkApproval');
    const logout = document.getElementById('pendingLogout');
    async function checkStatus() {
        check.disabled=true;
        try {
            const c=await api.context();
            if (c.role !== 'pending_officer') return window.location.replace('./index.html');
            document.getElementById('pendingEmail').textContent=c.user.email;
            msg.textContent='Approval is still pending. A CVO administrator must add your account to the Field Officers Team in Appwrite.';
        } catch(error) {
            if (error.code===401) return window.location.replace('./login.html');
            msg.textContent=api.readableError(error);
        } finally {check.disabled=false;}
    }
    check.addEventListener('click',checkStatus);
    logout.addEventListener('click',async()=>{
        logout.disabled=true;
        try{await api.logout();window.location.replace('./login.html');}
        catch(e){msg.textContent=api.readableError(e);logout.disabled=false;}
    });
    checkStatus();
})();

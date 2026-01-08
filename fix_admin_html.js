const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'admin.html');
const content = fs.readFileSync(filePath, 'utf8');
const lines = content.split('\n');

// Find the split point
const splitIndex = lines.findIndex(l => l.includes('// CUPONES, RECURSOS, MIEMBROS, TOASTS (Sin cambios)'));

if (splitIndex === -1) {
    console.error('Could not find split point!');
    process.exit(1);
}

// Keep lines before split point
const newLines = lines.slice(0, splitIndex);

// Append rescued content
const rescuedContent = `
        // --- RESCUED FUNCTIONS (Cleaned) ---

        // CUPONES
        function openCouponModal() { document.getElementById('coupon-modal').showModal(); }
        function generateCode() { document.getElementById('coupon-code').value = Math.random().toString(36).substring(2, 10).toUpperCase(); }
        
        async function saveCoupon() {
            const code = document.getElementById('coupon-code').value.trim().toUpperCase();
            const discount = Number(document.getElementById('coupon-discount').value) || 0;
            if (!code || discount <= 0) return showToast('Código y descuento requeridos', 'error');
            if (discount > 100) return showToast('Descuento no puede ser mayor a 100%', 'error');
            try {
                await window.API.apiCreateCoupon({
                    code: code,
                    discount: discount,
                    type: 'percentage',
                    status: 'active',
                    maxUses: 0,
                    usedCount: 0,
                    minPurchase: 0
                });
                document.getElementById('coupon-modal').close();
                document.getElementById('coupon-code').value = '';
                document.getElementById('coupon-discount').value = '';
                state.coupons = await window.API.apiGetCoupons();
                renderCoupons();
                showToast('✓ Cupón creado: ' + code, 'success');
            } catch (err) {
                showToast('Error: ' + (err.message || 'No se pudo crear cupón'), 'error');
            }
        }

        function renderCoupons() {
            const tbody = document.getElementById('coupons-table-body');
            if (!state.coupons || state.coupons.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-gray-500">No hay cupones creados</td></tr>';
                return;
            }
            tbody.innerHTML = (state.coupons || []).map(c => \`
                <tr class="border-b hover:bg-gray-50">
                    <td class="p-4 font-mono font-bold text-slate-700">\${c.code}</td>
                    <td class="p-4 font-bold text-green-600">-\${c.discount}%</td>
                    <td class="p-4"><span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full border border-green-200">Activo</span></td>
                    <td class="p-4 text-right">
                        <button onclick="deleteCoupon(\${c.id})" class="text-red-500 hover:bg-red-50 p-2 rounded transition"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </td>
                </tr>
            \`).join('');
            lucide.createIcons();
        }

        async function deleteCoupon(id) {
            if (!confirm('¿Eliminar cupón?')) return;
            try {
                await window.API.apiDeleteCoupon(id);
                state.coupons = await window.API.apiGetCoupons();
                renderCoupons();
                showToast('Cupón eliminado');
            } catch (err) { showToast('Error al eliminar'); }
        }

        // PASSWORD & ROLES
        function openChangePasswordModal(id, name) {
            document.getElementById('pwd-user-id').value = id;
            document.getElementById('pwd-user-name').textContent = name;
            document.getElementById('new-user-pwd').value = '';
            document.getElementById('change-password-modal').showModal();
        }

        async function confirmChangePassword() {
            const id = document.getElementById('pwd-user-id').value;
            const pwd = document.getElementById('new-user-pwd').value;
            if (!pwd || pwd.length < 6) return showToast("Mínimo 6 caracteres", "error");

            try {
                const res = await fetch(\`/api/users/\${id}/password-force\`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ password: pwd })
                });
                if (res.ok) {
                    showToast("Contraseña actualizada", "success");
                    document.getElementById('change-password-modal').close();
                } else {
                    const d = await res.json();
                    showToast(d.error || "Error al actualizar", "error");
                }
            } catch (e) { showToast("Error de conexión", "error"); }
        }
        
        async function promoteToStaff(id) {
             if(!confirm('¿Promover usuario a administrador?')) return;
             try {
                 await window.API.apiUpdateUserRole(id, 'admin');
                 showToast('Usuario promovido');
                 state.members = await window.API.apiGetAllUsers();
                 renderMembers();
             } catch(e) { showToast('Error al promover'); }
        }

        async function assignMembership(userId) {
            if(!confirm('¿Asignar membresía completa gratis?')) return;
             // Logic missing in original snippet but preserving function
             showToast('Función no implementada en backend actual', 'info');
        }

        // TOAST SYSTEM
        function showToast(msg, type = 'info') {
            const container = document.getElementById('toast-container');
            if(!container) return console.warn('No toast container');
            const el = document.createElement('div');
            const colors = type === 'error' ? 'bg-red-500' : (type === 'success' ? 'bg-green-500' : 'bg-slate-800');
            el.className = \`\${colors} text-white px-4 py-3 rounded shadow-lg text-sm flex items-center gap-2 transform transition-all duration-300 translate-y-10 opacity-0\`;
            el.innerHTML = \`<span>\${msg}</span>\`;
            container.appendChild(el);
            requestAnimationFrame(() => { el.classList.remove('translate-y-10', 'opacity-0'); });
            setTimeout(() => {
                el.classList.add('opacity-0', 'translate-y-10');
                setTimeout(() => el.remove(), 300);
            }, 3000);
        }

        // APP INIT
         document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            const email = document.getElementById('email').value;
            const pass = document.getElementById('password').value;
            try {
                const user = await window.API.apiLogin(email, pass);
                if (user && (user.role === 'admin' || user.role === 'editor')) {
                    state.currentUser = user;
                    document.getElementById('login-view').classList.add('hide');
                    document.getElementById('app-layout').classList.remove('hide');
                    loadAdminData();
                    router('dashboard');
                    showToast(\`Bienvenido Admin \${user.firstName}\`, 'success');
                } else {
                    showToast('Acceso denegado: No eres administrador', 'error');
                }
            } catch (err) {
                showToast(err.message || 'Error de autenticación', 'error');
            }
        });

        lucide.createIcons();
    </script>
    
    <!-- Change Password Modal -->
    <dialog id="change-password-modal" class="p-6 rounded-lg border border-gray-200 shadow-xl backdrop:bg-black/50">
        <h3 class="text-lg font-bold mb-4">Cambiar Contraseña</h3>
        <p class="text-sm text-gray-500 mb-4">Usuario: <span id="pwd-user-name" class="font-bold"></span></p>
        <input type="hidden" id="pwd-user-id">
        <div class="space-y-3">
            <input type="password" id="new-user-pwd" placeholder="Nueva contraseña"
                class="w-full p-2 border rounded text-sm">
            <div class="flex justify-end gap-2 mt-4">
                <button onclick="document.getElementById('change-password-modal').close()"
                    class="px-3 py-1.5 text-sm text-gray-500 hover:text-gray-700">Cancelar</button>
                <button onclick="confirmChangePassword()"
                    class="px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700 font-bold">Guardar</button>
            </div>
        </div>
    </dialog>
</body>
</html>
`;

// Combine
const finalContent = newLines.join('\n') + '\n' + rescuedContent;

fs.writeFileSync(filePath, finalContent);
console.log('Fixed admin.html!');

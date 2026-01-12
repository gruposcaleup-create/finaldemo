
const BRAND_COLOR = '#D40B75';
const BG_COLOR = '#09090b';
const CARD_COLOR = '#121212';
const TEXT_COLOR = '#ffffff';
const MUTED_COLOR = '#a1a1aa';

const baseTemplate = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { margin: 0; padding: 0; background-color: ${BG_COLOR}; font-family: 'Arial', sans-serif; color: ${TEXT_COLOR}; }
    .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
    .card { background-color: ${CARD_COLOR}; padding: 40px; border-radius: 12px; border: 1px solid #333; text-align: center; }
    .logo { margin-bottom: 20px; font-size: 24px; font-weight: bold; letter-spacing: 2px; color: ${TEXT_COLOR}; }
    .logo span { color: ${BRAND_COLOR}; }
    .btn { display: inline-block; background-color: ${BRAND_COLOR}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; margin-top: 20px; }
    .footer { margin-top: 30px; text-align: center; font-size: 12px; color: ${MUTED_COLOR}; }
    h1 { font-size: 24px; margin-bottom: 10px; color: #ffffff !important; }
    p { line-height: 1.6; color: #e4e4e7 !important; }
    .code { font-size: 32px; font-weight: bold; letter-spacing: 5px; color: ${BRAND_COLOR}; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <img src="https://www.gjuarezlopez.com.mx/images/LOGOMORADOJULG.png" alt="Gonzalo Juárez" style="display: block; margin: 0 auto 20px auto; max-width: 180px; height: auto;" />
      ${content}
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} Gonzalo Juárez López Jr. Todos los derechos reservados.</p>
    </div>
  </div>
</body>
</html>
`;

module.exports = {
  getWelcomeEmail: (firstName) => baseTemplate(`
    <h1>¡Bienvenido, ${firstName}!</h1>
    <p>Gracias por unirte a nuestra comunidad. Estamos emocionados de acompañarte en tu camino de aprendizaje profesional.</p>
    <p>Ya tienes acceso completo a tu panel personal donde podrás gestionar tus cursos y certificaciones.</p>
    <a href="https://gjuarezlopez.com.mx/login.html" class="btn">Acceder a mi Cuenta</a>
  `),

  getRecoveryEmail: (code) => baseTemplate(`
    <h1>Recuperación de Contraseña</h1>
    <p>Hemos recibido una solicitud para restablecer tu contraseña. Usa el siguiente código para continuar:</p>
    <div class="code">${code}</div>
    <p>Este código expirará en 5 minutos. Si no solicitaste esto, puedes ignorar este correo.</p>
  `)
};

// salestrack-service/middlewares/validateToken.js

const { verify } = require('jsonwebtoken');
// Kita perlukan model Users untuk sahkan pengguna wujud dalam database
const { Users } = require('@suites/database-models'); 

const validateToken = async (req, res, next) => {
  // 1. Ambil token dari 'Authorization' header
  const authHeader = req.header("Authorization");
  const accessToken = authHeader && authHeader.split(" ")[1];

  if (!accessToken) {
    return res.status(401).json({ error: "Akses ditolak. Tiada token disediakan." });
  }

  try {
    // 2. Sahkan token guna JWT_SECRET
    const validToken = verify(accessToken, process.env.JWT_SECRET);
    
    // 3. Cari pengguna dalam database berdasarkan maklumat dalam token
    const user = await Users.findOne({ 
      where: { uuid: validToken.uuid },
      // Kita tak perlukan kata laluan di sini
      attributes: { exclude: ['password'] } 
    }); 
    
    if (validToken && user) {
      // 4. Jika sah, lampirkan maklumat pengguna pada objek 'req'
      req.user = user;
      return next(); // Teruskan ke proses seterusnya (route handler)
    }
  } catch (err) {
    // Jika token tak sah atau tamat tempoh
    return res.status(401).json({ error: "Token tidak sah." });
  }
};

module.exports = { validateToken };
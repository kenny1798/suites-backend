// salestrack-service/controllers/products.controller.js
const { Products } = require('@suites/database-models');

function toCents({ price, priceCents }) {
  if (typeof priceCents === 'number') return Math.max(0, Math.round(priceCents));
  if (price == null || price === '') return 0;
  const n = Number(String(price).replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
}

// GET /teams/:teamId/products?active=1&search=keyword
exports.list = async (req, res) => {
  const { teamId } = req.params;
  const { active, search } = req.query;
  const where = { teamId };
  if (active === '1') where.isActive = true;
  if (active === '0') where.isActive = false;

  if (search) {
    where.name = { $like: `%${search}%` }; // if using Sequelize v6, use Op.like
  }

  try {
    const rows = await Products.findAll({
      where,
      order: [['isActive', 'DESC'], ['name', 'ASC']],
    });
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to fetch products.', details: e.message });
  }
};

// POST /teams/:teamId/products
exports.create = async (req, res) => {
  const { teamId } = req.params;
  const { name, description, category, isActive } = req.body;
  const priceCents = toCents(req.body);

  try {
    if (!name?.trim()) return res.status(400).json({ error: 'Product name is required.' });

    const row = await Products.create({
      name: name.trim(),
      description: description || null,
      category: category || null,
      priceCents,
      isActive: isActive !== false,
      teamId,
    });

    res.status(201).json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to create product.', details: e.message });
  }
};

// PUT /teams/:teamId/products/:productId
exports.update = async (req, res) => {
  const { teamId, productId } = req.params;
  const { name, description, category, isActive } = req.body;
  const priceCents = toCents(req.body);

  try {
    const row = await Products.findOne({ where: { id: productId, teamId } });
    if (!row) return res.status(404).json({ error: 'Product not found.' });

    if (name != null) row.name = String(name).trim();
    if (description !== undefined) row.description = description;
    if (category !== undefined) row.category = category;
    if (priceCents !== undefined) row.priceCents = priceCents;
    if (typeof isActive === 'boolean') row.isActive = isActive;

    await row.save();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to update product.', details: e.message });
  }
};

// DELETE /teams/:teamId/products/:productId  (soft)
exports.softDelete = async (req, res) => {
  const { teamId, productId } = req.params;
  try {
    const row = await Products.findOne({ where: { id: productId, teamId } });
    if (!row) return res.status(404).json({ error: 'Product not found.' });
    row.isActive = false;
    await row.save();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete product.', details: e.message });
  }
};

// POST /teams/:teamId/products/:productId/restore
exports.restore = async (req, res) => {
  const { teamId, productId } = req.params;
  try {
    const row = await Products.findOne({ where: { id: productId, teamId } });
    if (!row) return res.status(404).json({ error: 'Product not found.' });
    row.isActive = true;
    await row.save();
    res.json(row);
  } catch (e) {
    res.status(500).json({ error: 'Failed to restore product.', details: e.message });
  }
};

// Simpan sebagai: routes/tools.js

const router = require('express').Router();
const { Tool, Plan, PlanFeature, Feature} = require('@suites/database-models'); // Import model yang diperlukan

/**
 * @route   GET /api/tools
 * @desc    Dapatkan senarai semua tool yang aktif
 * @access  Public
 */
router.get('/', async (req, res) => {
  try {
    const tools = await Tool.findAll({
      // Hanya ambil tool yang ditandakan sebagai aktif
      where: { isActive: true },

      // Sertakan juga maklumat pelan (pricing plans) untuk setiap tool
      include: {
        model: Plan,
        as: 'plans', // Pastikan 'as' sepadan dengan association dalam models/index.js
        where: { isActive: true }, // Hanya ambil plan yang aktif
        required: false, // Guna LEFT JOIN, tunjuk tool walaupun tiada plan
      },

      // Susun ikut nombor 'sort' dan kemudian nama
      order: [
        ['sort', 'ASC'],
        ['name', 'ASC'],
      ],
    });

    res.json(tools);
  } catch (error) {
    console.error('Error fetching tools:', error);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

/**
 * @route   GET /api/tools/:slug
 * @desc    Dapatkan maklumat terperinci untuk satu tool, termasuk pelan harganya
 * @access  Public
 */
router.get('/:slug', async (req, res) => {
    try {
      const { slug } = req.params; // Dapatkan 'slug' dari URL, contoh: "salestrack"
  
      const tool = await Tool.findByPk(slug, {
        // Guna 'include' bersarang (nested) untuk dapatkan data berkaitan dalam satu query
        include: [
          {
            model: Plan,
            as: 'plans',
            where: { isActive: true },
            required: false, // Guna LEFT JOIN: Pulangkan tool walaupun tiada plan aktif
            
            // Untuk setiap plan, sertakan sekali senarai feature-nya
            include: [
              {
                model: PlanFeature,
                // 'as' tak perlu jika tiada alias
                include: [
                  {
                    model: Feature, // Sertakan maklumat penuh dari table Feature
                    attributes: ['key', 'name', 'description'], // Pilih lajur yang nak dihantar
                  }
                ]
              }
            ]
          },
        ],
      });
  
      // Jika tool dengan slug tersebut tidak dijumpai
      if (!tool) {
        return res.status(404).json({ error: 'TOOL_NOT_FOUND' });
      }
  
      // Hantar data tool yang lengkap sebagai respon
      res.json(tool);
  
    } catch (error) {
      console.error(`Error fetching tool details for slug: ${req.params.slug}`, error);
      res.status(500).json({ error: 'Failed to fetch tool details' });
    }
  });

module.exports = router;
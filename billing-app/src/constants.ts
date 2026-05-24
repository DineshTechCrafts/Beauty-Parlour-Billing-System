
import { InventoryItem } from './types';

export const INITIAL_CATALOG: InventoryItem[] = [
    { id: '101', type: 'Service', category: 'Threading', description: 'Eyebrow Threading', price: 50 },
    { id: '102', type: 'Service', category: 'Threading', description: 'Chin Threading', price: 50 },
    { id: '103', type: 'Service', category: 'Threading', description: 'Upper Lip Threading', price: 50 },
    { id: '104', type: 'Service', category: 'Threading', description: 'Lower Lip Threading', price: 50 },
    { id: '105', type: 'Service', category: 'Threading', description: 'Forehead Threading', price: 50 },
    { id: '106', type: 'Service', category: 'Threading', description: 'Side Locks Threading', price: 120 },
    { id: '107', type: 'Service', category: 'Threading', description: 'Full Face Threading', price: 350 },

    { id: '201', type: 'Service', category: 'Hair Treatments', description: 'Hair Smoothening', price: 2500 },
    { id: '202', type: 'Service', category: 'Hair Treatments', description: 'Hair Straightening', price: 2500 },
    { id: '203', type: 'Service', category: 'Hair Treatments', description: 'Keratin Spa (per feet length)', price: 2000 },
    { id: '204', type: 'Service', category: 'Hair Treatments', description: 'Hair Botox (per feet length)', price: 2500 },
    { id: '205', type: 'Service', category: 'Hair Treatments', description: 'Hair Spa', price: 1000 },
    { id: '206', type: 'Service', category: 'Hair Treatments', description: 'Head Lice Treatment', price: 1200 },
    { id: '207', type: 'Service', category: 'Hair Treatments', description: 'Anti Hairfall Treatment', price: 2000 },
    { id: '208', type: 'Service', category: 'Hair Treatments', description: 'Anti Dandruff Treatment', price: 2000 },
    { id: '209', type: 'Service', category: 'Hair Treatments', description: 'Root Touch Up (Ammonia Free)', price: 4000 },
    { id: '210', type: 'Service', category: 'Hair Treatments', description: 'Nanoplastia Treatment', price: 7000 },
    { id: '211', type: 'Service', category: 'Hair Treatments', description: 'Hair Wash & Blow Dry', price: 500 },
    { id: '212', type: 'Service', category: 'Hair Treatments', description: 'Hair Streak (per streak)', price: 500 },

    { id: '301', type: 'Service', category: 'Hair Color', description: 'Global Color (Natural Black)', price: 2000 },
    { id: '302', type: 'Service', category: 'Hair Color', description: 'Global Color (Ammonia Free)', price: 2300 },
    { id: '303', type: 'Service', category: 'Hair Color', description: 'Herbal Hair Color', price: 4500 },

    { id: '401', type: 'Service', category: 'Hair Cut', description: 'Basic Hair Cut', price: 750 },
    { id: '402', type: 'Service', category: 'Hair Cut', description: 'Layer / Feather Cut', price: 4500 },
    { id: '403', type: 'Service', category: 'Hair Cut', description: 'Kids Hair Cut (Below 10 yrs)', price: 300 },

    { id: '501', type: 'Service', category: 'Hair Wash & Styling', description: 'Shampoo + Conditioner + Blast Dry', price: 500 },
    { id: '502', type: 'Service', category: 'Hair Wash & Styling', description: 'Ultimate Blow Dry & Settings', price: 750 },
    { id: '503', type: 'Service', category: 'Hair Wash & Styling', description: 'Dry Straight', price: 500 },
    { id: '504', type: 'Service', category: 'Hair Wash & Styling', description: 'Curl Tong Styling', price: 500 },
    { id: '505', type: 'Service', category: 'Hair Wash & Styling', description: 'Advanced Styling', price: 750 },
    { id: '506', type: 'Service', category: 'Hair Wash & Styling', description: 'Keratin Wash', price: 700 },
    { id: '507', type: 'Service', category: 'Hair Wash & Styling', description: 'Schwarzkopf Wash', price: 600 },

    { id: '601', type: 'Service', category: 'Facials', description: 'Fruit Facial', price: 750 },
    { id: '602', type: 'Service', category: 'Facials', description: 'Pearl Facial', price: 850 },
    { id: '603', type: 'Service', category: 'Facials', description: 'Golden Facial', price: 1000 },
    { id: '604', type: 'Service', category: 'Facials', description: 'Herbal Facial', price: 1000 },
    { id: '605', type: 'Service', category: 'Facials', description: 'Whitening Facial', price: 1200 },
    { id: '606', type: 'Service', category: 'Facials', description: 'Oxyfresh Facial', price: 1200 },
    { id: '607', type: 'Service', category: 'Facials', description: 'D-Tan Facial', price: 1200 },

    { id: '701', type: 'Service', category: 'Nail Services', description: 'Soft Gel Extensions', price: 4500 },
    { id: '702', type: 'Service', category: 'Nail Services', description: 'Gel Extensions', price: 2000 },
    { id: '703', type: 'Service', category: 'Nail Services', description: 'Acrylic Extensions', price: 2500 },
    { id: '704', type: 'Service', category: 'Nail Services', description: 'Press On Nails', price: 1000 },
    { id: '705', type: 'Service', category: 'Nail Services', description: 'Hard Press On Nails', price: 1500 },

    { id: '801', type: 'Service', category: 'Mehandi', description: 'Basic Mehandi - Hands', price: 450 },
    { id: '802', type: 'Service', category: 'Mehandi', description: 'Basic Mehandi - Legs', price: 600 },
    { id: '803', type: 'Service', category: 'Mehandi', description: 'Bridal Mehandi', price: 4000 },

    { id: '901', type: 'Service', category: 'Bridal Packages', description: 'Basic Bridal Package', price: 25000 },
    { id: '902', type: 'Service', category: 'Bridal Packages', description: 'Premium Bridal Package', price: 35000 },

    { id: '1', type: 'Service', category: 'Laser', description: 'Laser Scar Reduction', price: 5000 },
    { id: '2', type: 'Service', category: 'Laser', description: 'Laser Full Leg Hair Reduction', price: 8000 },
    { id: '3', type: 'Service', category: 'Laser', description: 'Laser Skin Rejuvenation', price: 9999 },
    { id: '4', type: 'Service', category: 'Laser', description: 'Full Body Laser', price: 9999 },
    { id: '5', type: 'Service', category: 'Laser', description: 'Laser Tattoo Removal', price: 3000 },
    { id: '6', type: 'Service', category: 'Weight Loss', description: 'Weight Loss 5KG (15 Sessions)', price: 15000 },
    { id: '7', type: 'Service', category: 'Weight Loss', description: 'Weight Loss 10KG (25 Sessions)', price: 25000 },
    { id: '8', type: 'Service', category: 'Weight Loss', description: 'Inch Loss 5KG (15 Sessions)', price: 15000 },
    { id: '9', type: 'Service', category: 'Weight Loss', description: 'Inch Loss 10KG (25 Sessions)', price: 25000 }
];

// What the demo is made of: the people, the restaurants and their menus.
// Everything sits in Lahore around Gulberg, one of the areas the landing page
// offers, so picking "Gulberg, Lahore" shows every restaurant.

import type { Point } from '../support/places.ts';

/** Gulberg's centre, as the landing page's area list has it (src/web/src/lib/location.ts). */
export const GULBERG: Point = { lat: 31.52, lng: 74.35 };

/** The numbers to sign in with. Admin is the one e2e/compose.yml lists in ADMIN_PHONES. */
export const PHONES = {
  admin: '+923009999999',
  customer: '+923001000001',
  rider: '+923003000001',
  pendingRider: '+923003000002',
} as const;

/** Restaurant owners sign in as +92300200000<n>, the n-th restaurant below, from 1. */
export const ownerPhone = (n: number) => `+92300200${String(n).padStart(4, '0')}`;

export interface OptionGroup {
  name: string;
  minSelect: number;
  maxSelect: number;
  options: { name: string; pricePaisa: number }[];
}

export interface Item {
  name: string;
  description?: string;
  /** Rupees, to keep the list readable; sent in paisa. */
  price: number;
  optionGroups?: OptionGroup[];
  soldOut?: boolean;
}

export interface Shop {
  name: string;
  description: string;
  cuisines: string[];
  area: string;
  line1: string;
  /** Metres north and east of Gulberg's centre. */
  offset: [north: number, east: number];
  /** Rupees. */
  deliveryFee: number;
  minimumOrder: number;
  deliveryMinutes: number;
  menu: { category: string; items: Item[] }[];
  /** Left waiting for an admin, so the approval queue has something in it. */
  pending?: boolean;
}

const size = (full: number): OptionGroup => ({
  name: 'Size',
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: 'Single', pricePaisa: 0 },
    { name: 'Full', pricePaisa: full * 100 },
  ],
});

const drink: OptionGroup = {
  name: 'Add a drink',
  minSelect: 0,
  maxSelect: 1,
  options: [
    { name: 'Coke 345 ml', pricePaisa: 12000 },
    { name: 'Sprite 345 ml', pricePaisa: 12000 },
    { name: 'Mineral water', pricePaisa: 8000 },
  ],
};

const spice: OptionGroup = {
  name: 'Spice level',
  minSelect: 1,
  maxSelect: 1,
  options: [
    { name: 'Mild', pricePaisa: 0 },
    { name: 'Medium', pricePaisa: 0 },
    { name: 'Hot', pricePaisa: 0 },
  ],
};

export const SHOPS: Shop[] = [
  {
    name: 'Lahori Biryani House',
    description: 'Dum-cooked biryani and pulao, the way Lahore likes it.',
    cuisines: ['biryani', 'pakistani'],
    area: 'Gulberg III',
    line1: '24-B, Main Boulevard',
    offset: [300, -400],
    deliveryFee: 99,
    minimumOrder: 300,
    deliveryMinutes: 30,
    menu: [
      {
        category: 'Biryani',
        items: [
          {
            name: 'Chicken Biryani',
            description: 'Basmati, chicken, aloo and our masala.',
            price: 650,
            optionGroups: [size(300), drink],
          },
          {
            name: 'Beef Biryani',
            description: 'Slow-cooked beef, layered with saffron rice.',
            price: 750,
            optionGroups: [size(350), drink],
          },
          {
            name: 'Sindhi Biryani',
            description: 'Tangy, with plums and green chillies.',
            price: 700,
            optionGroups: [size(320)],
          },
        ],
      },
      {
        category: 'Pulao',
        items: [
          {
            name: 'Chicken Pulao',
            description: 'Mild yakhni pulao with shami kabab.',
            price: 600,
            optionGroups: [size(280)],
          },
          { name: 'Mutton Pulao', price: 950, optionGroups: [size(450)], soldOut: true },
        ],
      },
      {
        category: 'Sides',
        items: [
          { name: 'Raita', price: 80 },
          { name: 'Salad', price: 60 },
          { name: 'Shami Kabab (2 pcs)', price: 180 },
        ],
      },
    ],
  },
  {
    name: 'Butt Karahi',
    description: 'Charcoal-fired karahi, cooked to order in desi ghee.',
    cuisines: ['karahi', 'pakistani'],
    area: 'Gulberg II',
    line1: '7, Liberty Market',
    offset: [-500, 600],
    deliveryFee: 129,
    minimumOrder: 800,
    deliveryMinutes: 40,
    menu: [
      {
        category: 'Karahi',
        items: [
          {
            name: 'Chicken Karahi',
            description: 'Tomatoes, ginger and green chillies.',
            price: 1600,
            optionGroups: [
              {
                name: 'Size',
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: 'Half kg', pricePaisa: 0 },
                  { name: 'One kg', pricePaisa: 140000 },
                ],
              },
              spice,
            ],
          },
          {
            name: 'Mutton Karahi',
            description: 'Tender mutton, black pepper, desi ghee.',
            price: 2800,
            optionGroups: [
              {
                name: 'Size',
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: 'Half kg', pricePaisa: 0 },
                  { name: 'One kg', pricePaisa: 260000 },
                ],
              },
              spice,
            ],
          },
          {
            name: 'White Karahi',
            description: 'Creamy, with yoghurt and cashews.',
            price: 1800,
            optionGroups: [spice],
          },
        ],
      },
      {
        category: 'Bread',
        items: [
          { name: 'Roghni Naan', price: 70 },
          { name: 'Tandoori Roti', price: 30 },
          { name: 'Garlic Naan', price: 90 },
        ],
      },
    ],
  },
  {
    name: 'Smash Bros Burgers',
    description: 'Smashed patties, potato buns, loaded fries.',
    cuisines: ['burgers', 'fast-food'],
    area: 'MM Alam Road',
    line1: '96-C, MM Alam Road',
    offset: [800, 300],
    deliveryFee: 99,
    minimumOrder: 500,
    deliveryMinutes: 25,
    menu: [
      {
        category: 'Burgers',
        items: [
          {
            name: 'Classic Smash',
            description: 'Two beef patties, cheese, pickles, house sauce.',
            price: 950,
            optionGroups: [
              {
                name: 'Extras',
                minSelect: 0,
                maxSelect: 3,
                options: [
                  { name: 'Extra cheese', pricePaisa: 15000 },
                  { name: 'Jalapeños', pricePaisa: 8000 },
                  { name: 'Beef bacon', pricePaisa: 25000 },
                ],
              },
              drink,
            ],
          },
          {
            name: 'Crispy Chicken',
            description: 'Buttermilk fried chicken, slaw, spicy mayo.',
            price: 850,
            optionGroups: [drink],
          },
          { name: 'Mushroom Swiss', price: 1050, optionGroups: [drink] },
        ],
      },
      {
        category: 'Fries',
        items: [
          { name: 'Plain Fries', price: 350 },
          { name: 'Loaded Fries', description: 'Cheese sauce, jalapeños, beef.', price: 650 },
        ],
      },
    ],
  },
  {
    name: 'Pizza Napoli',
    description: 'Wood-fired Neapolitan pizza and fresh pasta.',
    cuisines: ['pizza', 'italian'],
    area: 'Gulberg III',
    line1: '3, Hali Road',
    offset: [-200, -900],
    deliveryFee: 149,
    minimumOrder: 900,
    deliveryMinutes: 35,
    menu: [
      {
        category: 'Pizza',
        items: [
          {
            name: 'Margherita',
            description: 'Tomato, fior di latte, basil.',
            price: 1400,
            optionGroups: [
              {
                name: 'Size',
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: '10 inch', pricePaisa: 0 },
                  { name: '14 inch', pricePaisa: 60000 },
                ],
              },
            ],
          },
          {
            name: 'Chicken Tikka',
            description: 'Tikka chunks, onions, green chillies.',
            price: 1650,
            optionGroups: [
              {
                name: 'Size',
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: '10 inch', pricePaisa: 0 },
                  { name: '14 inch', pricePaisa: 70000 },
                ],
              },
            ],
          },
          { name: 'Pepperoni', price: 1800 },
        ],
      },
      {
        category: 'Pasta',
        items: [
          { name: 'Penne Arrabbiata', price: 1200 },
          { name: 'Fettuccine Alfredo', price: 1450 },
        ],
      },
    ],
  },
  {
    name: 'Dragon Wok',
    description: 'Pakistani-Chinese favourites, fresh off the wok.',
    cuisines: ['chinese'],
    area: 'Gulberg I',
    line1: '15, Main Market',
    offset: [1200, -200],
    deliveryFee: 99,
    minimumOrder: 600,
    deliveryMinutes: 30,
    menu: [
      {
        category: 'Mains',
        items: [
          { name: 'Chicken Manchurian', price: 950 },
          { name: 'Kung Pao Chicken', price: 1050, optionGroups: [spice] },
          { name: 'Beef Chilli Dry', price: 1150, optionGroups: [spice] },
        ],
      },
      {
        category: 'Rice and noodles',
        items: [
          { name: 'Egg Fried Rice', price: 550 },
          { name: 'Chicken Chowmein', price: 750 },
        ],
      },
      { category: 'Soups', items: [{ name: 'Hot and Sour Soup', price: 450 }] },
    ],
  },
  {
    name: 'Shawarma Corner',
    description: 'Lebanese shawarma and platters, open late.',
    cuisines: ['shawarma', 'lebanese'],
    area: 'Gulberg II',
    line1: '42, Mini Market',
    offset: [-900, -300],
    deliveryFee: 79,
    minimumOrder: 300,
    deliveryMinutes: 20,
    menu: [
      {
        category: 'Shawarma',
        items: [
          {
            name: 'Chicken Shawarma',
            description: 'Garlic sauce, pickles, fries inside.',
            price: 450,
            optionGroups: [
              {
                name: 'Bread',
                minSelect: 1,
                maxSelect: 1,
                options: [
                  { name: 'Pita', pricePaisa: 0 },
                  { name: 'Saj', pricePaisa: 5000 },
                ],
              },
            ],
          },
          { name: 'Zinger Shawarma', price: 550 },
        ],
      },
      {
        category: 'Platters',
        items: [
          { name: 'Shawarma Platter', description: 'Chicken, rice, hummus, salad.', price: 1100 },
          { name: 'Falafel Platter', price: 850 },
        ],
      },
    ],
  },
  {
    name: 'Sweet Tooth',
    description: 'Cakes, brownies and kulfi.',
    cuisines: ['desserts', 'bakery'],
    area: 'Gulberg III',
    line1: '11-A, Ghalib Market',
    offset: [600, 1100],
    deliveryFee: 99,
    minimumOrder: 400,
    deliveryMinutes: 30,
    menu: [
      {
        category: 'Cakes',
        items: [
          { name: 'Chocolate Fudge Slice', price: 450 },
          { name: 'Red Velvet Slice', price: 480 },
        ],
      },
      {
        category: 'Desserts',
        items: [
          { name: 'Walnut Brownie', price: 300 },
          { name: 'Pista Kulfi', price: 250 },
          { name: 'Gulab Jamun (4 pcs)', price: 280 },
        ],
      },
    ],
  },
  {
    name: 'Chai Khana',
    description: 'Doodh patti, parathas and a proper desi breakfast.',
    cuisines: ['chai', 'breakfast'],
    area: 'Gulberg II',
    line1: '5, Firdous Market',
    offset: [-1300, 800],
    deliveryFee: 79,
    minimumOrder: 250,
    deliveryMinutes: 25,
    pending: true,
    menu: [
      {
        category: 'Chai',
        items: [
          { name: 'Doodh Patti', price: 150 },
          { name: 'Kashmiri Chai', price: 220 },
        ],
      },
      {
        category: 'Breakfast',
        items: [
          { name: 'Aloo Paratha', price: 250 },
          { name: 'Halwa Puri', description: 'Two puris, halwa, chana.', price: 450 },
        ],
      },
    ],
  },
];

/** What the customer ordered before, so history, reviews, reports and earnings have something in them. */
export const PAST_ORDERS: {
  shop: string;
  lines: { item: string; quantity: number; choices?: string[] }[];
  voucher?: string;
  tip?: number;
  review: { restaurant: number; rider: number; comment: string };
}[] = [
  {
    shop: 'Lahori Biryani House',
    lines: [
      { item: 'Chicken Biryani', quantity: 2, choices: ['Full'] },
      { item: 'Raita', quantity: 2 },
    ],
    tip: 100,
    review: { restaurant: 5, rider: 5, comment: 'Best biryani in Gulberg, still hot when it arrived.' },
  },
  {
    shop: 'Smash Bros Burgers',
    lines: [
      { item: 'Classic Smash', quantity: 2, choices: ['Extra cheese'] },
      { item: 'Loaded Fries', quantity: 1 },
    ],
    voucher: 'KOALA20',
    review: { restaurant: 4, rider: 5, comment: 'Juicy burgers. Fries could be crispier.' },
  },
  {
    shop: 'Butt Karahi',
    lines: [
      { item: 'Chicken Karahi', quantity: 1, choices: ['One kg', 'Medium'] },
      { item: 'Roghni Naan', quantity: 4 },
    ],
    tip: 50,
    review: { restaurant: 5, rider: 4, comment: 'Proper Lahori karahi.' },
  },
  {
    shop: 'Pizza Napoli',
    lines: [
      { item: 'Margherita', quantity: 1, choices: ['14 inch'] },
      { item: 'Fettuccine Alfredo', quantity: 1 },
    ],
    review: { restaurant: 4, rider: 5, comment: 'Lovely crust.' },
  },
];

/** Restaurants the customer has hearted. */
export const FAVOURITES = ['Lahori Biryani House', 'Butt Karahi'];

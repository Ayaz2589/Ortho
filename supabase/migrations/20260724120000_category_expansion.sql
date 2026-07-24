-- Expand `transaction_category` enum with granular subcategories.
-- All statements are idempotent (IF NOT EXISTS). No existing values are removed.

-- Food & Drink
alter type transaction_category add value if not exists 'fast_food';
alter type transaction_category add value if not exists 'alcohol';
alter type transaction_category add value if not exists 'takeout';

-- Transport
alter type transaction_category add value if not exists 'parking';
alter type transaction_category add value if not exists 'rideshare';

-- Home
alter type transaction_category add value if not exists 'home_improvement';
alter type transaction_category add value if not exists 'insurance';

-- Health & Wellness
alter type transaction_category add value if not exists 'gym';
alter type transaction_category add value if not exists 'pharmacy';
alter type transaction_category add value if not exists 'mental_health';

-- Entertainment
alter type transaction_category add value if not exists 'streaming';
alter type transaction_category add value if not exists 'gaming';
alter type transaction_category add value if not exists 'events';

-- Shopping
alter type transaction_category add value if not exists 'clothing';
alter type transaction_category add value if not exists 'electronics';
alter type transaction_category add value if not exists 'personal_care';
alter type transaction_category add value if not exists 'gifts';

-- Education
alter type transaction_category add value if not exists 'education';
alter type transaction_category add value if not exists 'books';

-- Income subcategories
alter type transaction_category add value if not exists 'salary';
alter type transaction_category add value if not exists 'bonus';
alter type transaction_category add value if not exists 'freelance';
alter type transaction_category add value if not exists 'business_income';
alter type transaction_category add value if not exists 'dividends';
alter type transaction_category add value if not exists 'rental_income';
alter type transaction_category add value if not exists 'gift_received';
alter type transaction_category add value if not exists 'refund';
alter type transaction_category add value if not exists 'other_income';

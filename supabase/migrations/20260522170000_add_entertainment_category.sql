-- Add `entertainment` to the `transaction_category` enum.
--
-- New Bangla translation maps the value; client adds it to
-- `TransactionCategory` Swift enum + a popcorn SF Symbol + tint.
--
-- `ALTER TYPE ... ADD VALUE` cannot run inside an explicit transaction
-- block, but Supabase migrations execute each statement individually so
-- this is fine.

alter type transaction_category add value if not exists 'entertainment';

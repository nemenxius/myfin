ALTER TABLE transactions
  ADD COLUMN to_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL;

CREATE POLICY "Transactions must reference own to_account" ON transactions
FOR INSERT WITH CHECK (
  to_account_id IS NULL
  OR EXISTS (
    SELECT 1 FROM accounts
    WHERE accounts.id = to_account_id AND accounts.user_id = auth.uid()
  )
);
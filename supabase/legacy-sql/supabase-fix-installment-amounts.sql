-- Fix installment plans: total_amount currently stores the monthly payment amount.
-- The real total should be total_amount * total_installments.
-- And amount_per_installment should be the current total_amount (the monthly amount).

-- Step 1: Set amount_per_installment to the current total_amount (which is actually the monthly amount)
UPDATE installment_plans
SET amount_per_installment = total_amount
WHERE amount_per_installment IS NULL
   OR amount_per_installment != total_amount;

-- Step 2: Set total_amount to the real total (monthly × installments)
UPDATE installment_plans
SET total_amount = amount_per_installment * total_installments;

-- Also update each individual payment amount to match amount_per_installment
UPDATE installment_payments ip
SET amount = p.amount_per_installment
FROM installment_plans p
WHERE ip.plan_id = p.id;

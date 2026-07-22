-- Mueve YC Logistics fuera de la cohorte 'manufactura' a la nueva cohorte 'logistica'.
-- Solo afecta al slug yc-logistics; el resto de tenants no se toca.
UPDATE clients SET client_type = 'logistica' WHERE slug = 'yc-logistics';

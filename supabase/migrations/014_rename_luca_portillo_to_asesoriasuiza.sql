-- Rename display name for luca and portillo to "Asesoría Suiza".
-- Slugs stay intact so URLs (/luca, /portillo) keep working.

UPDATE clients SET name = 'Asesoría Suiza' WHERE slug IN ('luca', 'portillo');

-- DrawUp V20 personal Arch Coach, file 2 of 5: Inspiration Legends.
-- Three short, publicly documented principle words and one factual line each. No portraits, no quotes.
-- Safe to run twice: rows are upserted by key.

insert into public.arch_coach_legends (key, name, kind, principles, note, xp_required, sort_order) values
  ('paul-r-williams', 'Paul R. Williams', 'architect', array['Elegance','Client empathy','Perseverance'],
   'Los Angeles architect who became the first Black member of the American Institute of Architects in 1923.', 50, 10),
  ('julia-morgan', 'Julia Morgan', 'architect', array['Craftsmanship','Reinforced concrete','Client focus'],
   'First woman licensed as an architect in California and designer of Hearst Castle. AIA Gold Medal 2014.', 100, 20),
  ('frank-lloyd-wright', 'Frank Lloyd Wright', 'architect', array['Organic design','Harmony with site','Open plan'],
   'American architect of Fallingwater and the Solomon R. Guggenheim Museum in New York.', 150, 30),
  ('norma-merrick-sklarek', 'Norma Merrick Sklarek', 'architect', array['Technical rigor','Project delivery','Mentorship'],
   'First Black woman licensed as an architect in New York (1954) and California (1962).', 200, 40),
  ('ove-arup', 'Ove Arup', 'engineer', array['Total design','Integration','Humane engineering'],
   'Anglo-Danish structural engineer who founded Arup and argued for total design across disciplines.', 250, 50),
  ('i-m-pei', 'I. M. Pei', 'architect', array['Geometric clarity','Light','Modernism'],
   'Chinese-American architect of the Louvre Pyramid in Paris. Pritzker Architecture Prize 1983.', 300, 60),
  ('fazlur-rahman-khan', 'Fazlur Rahman Khan', 'engineer', array['Structural efficiency','Tube systems','Collaboration'],
   'Structural engineer behind the tube systems of the John Hancock Center and the Sears (Willis) Tower in Chicago.', 350, 70),
  ('emily-warren-roebling', 'Emily Warren Roebling', 'engineer', array['Persistence','Technical fluency','Coordination'],
   'Carried day to day engineering coordination of the Brooklyn Bridge after Washington Roebling fell ill.', 400, 80),
  ('tadao-ando', 'Tadao Ando', 'architect', array['Concrete','Light','Simplicity'],
   'Self-taught Japanese architect known for exposed concrete and light. Pritzker Architecture Prize 1995.', 450, 90),
  ('zaha-hadid', 'Zaha Hadid', 'architect', array['Vision','Fluidity','Innovation'],
   'Iraqi-British architect and the first woman to receive the Pritzker Architecture Prize, in 2004.', 500, 100)
on conflict (key) do update set
  name = excluded.name, kind = excluded.kind, principles = excluded.principles,
  note = excluded.note, xp_required = excluded.xp_required, sort_order = excluded.sort_order;

select 'DONE drawup-v20-coach-02' as status;
-- END

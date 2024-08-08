require 'pg'
require 'dotenv'

Dotenv.load

conn = PG.connect(ENV['DATABASE_URL'])
res = conn.exec("SELECT * FROM playing_with_neon;")

res.each do |row|
    puts "%s | %s | %s" % row.values_at('id', 'name', 'value')
end

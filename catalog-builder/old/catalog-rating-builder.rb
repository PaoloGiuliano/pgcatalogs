require "json"
require "uri"
require "net/http"
require "time"

TMDB_TOKEN = ENV["TMDB_TOKEN"]
abort "ERROR: Set TMDB_TOKEN environment variable" if TMDB_TOKEN.nil? || TMDB_TOKEN.empty?

# -------------------------------------------------------------------
# LOAD RATING CACHE
# -------------------------------------------------------------------
RATINGS_FILE = "ratings.json"
ratings_cache =
  if File.exist?(RATINGS_FILE)
    JSON.parse(File.read(RATINGS_FILE))
  else
    {}
  end

# -------------------------------------------------------------------
# INTERACTIVE CONFIGURATION (VALIDATED)
# -------------------------------------------------------------------

def ask(prompt)
  print "#{prompt}: "
  gets.chomp.strip
end

def ask_int(prompt, min:, max:)
  loop do
    print "#{prompt} (#{min}-#{max}): "
    input = gets.chomp
    return input.to_i if input.match?(/^\d+$/) && input.to_i.between?(min, max)
    puts "Invalid input. Must be a number between #{min} and #{max}."
  end
end

def ask_float_range(prompt, min:, max:)
  loop do
    print "#{prompt} (#{min}-#{max}): "
    input = gets.chomp
    return input.to_f if input.match?(/^\d+(\.\d+)?$/) && input.to_f.between?(min,max)
    puts "Invalid number. Must be between #{min} and #{max}."
  end
end

def ask_choice(prompt, choices)
  loop do
    puts "#{prompt}:"
    choices.each { |c| puts "  - #{c}" }
    print "Choose: "
    input = gets.chomp.strip
    return input if choices.include?(input)
    puts "Invalid choice."
  end
end

def ask_genres(valid_genres)
  loop do
    puts "Allowed genres: #{valid_genres.join(", ")}"
    print "Enter genres (comma-separated): "
    list = gets.chomp.split(",").map(&:strip).map(&:downcase)
    return list if list.all? { |g| valid_genres.include?(g) }
    puts "Invalid genre in list."
  end
end

def ask_catalog_name
  loop do
    name = ask("Catalog name (no spaces)").strip
    return name if name.match?(/^[A-Za-z0-9_\-]+$/)
    puts "Catalog name must contain only letters, numbers, underscores, or dashes."
  end
end

# -------------------------------------------------------------------
# VALID SETS
# -------------------------------------------------------------------

VALID_LANGUAGES = [
  "en-US", "en-GB", "fr-FR", "es-ES", "de-DE", "it-IT", "ja-JP", "ko-KR", "zh-CN"
]

VALID_SORT = [
  "original_title.asc", "original_title.desc",
  "popularity.asc", "popularity.desc",
  "revenue.asc", "revenue.desc",
  "primary_release_date.asc", "primary_release_date.desc",
  "title.asc", "title.desc",
  "vote_average.asc", "vote_average.desc",
  "vote_count.asc", "vote_count.desc"
]

VALID_GENRES = [
  "action", "adventure", "animation", "comedy", "crime", "documentary",
  "drama", "family", "fantasy", "history", "horror", "music", "mystery",
  "romance", "science fiction", "tv movie", "thriller", "war", "western"
]

# -------------------------------------------------------------------
# PROMPTS
# -------------------------------------------------------------------

START_YEAR        = ask_int("Enter start year", min: 1900, max: 2100)
END_YEAR          = ask_int("Enter end year", min: 1900, max: 2100)
VOTE_AVG_MIN      = ask_float_range("Minimum vote_average", min:0.0, max:10.0)
VOTE_COUNT_MIN    = ask_int("Minimum vote_count", min: 0, max: 999_999)
PAGES             = ask_int("How many pages to fetch from TMDB?", min: 1, max: 50)

LANGUAGE          = ask_choice("Select language (TMDB format)", VALID_LANGUAGES)

SORT_BY           = ask_choice("Select sort order", VALID_SORT)

# Forced to false per your request
ADULT             = false
VIDEO             = false

CATALOG_NAME      = ask_catalog_name
WITH_GENRES       = ask_genres(VALID_GENRES)

MIN_CRITIC_SCORE = ask_int("Minimum critic score", min:0, max:100)


# -------------------------------------------------------------------
# TMDB helper
# -------------------------------------------------------------------
def tmdb_get(url)
  uri = URI(url)
  http = Net::HTTP.new(uri.host, uri.port)
  http.use_ssl = true

  req = Net::HTTP::Get.new(uri)
  req["accept"] = "application/json"
  req["Authorization"] = "Bearer #{ENV["TMDB_TOKEN"]}"

  res = http.request(req)
  JSON.parse(res.body)
end

# -------------------------------------------------------------------
# Extract Rotten Tomatoes
# -------------------------------------------------------------------
def extract_rotten(data)
  arr = data["Ratings"]
  return nil unless arr
  rt = arr.find { |r| r["Source"] == "Rotten Tomatoes" }
  return nil unless rt
  rt["Value"].delete("%").to_i
end

# -------------------------------------------------------------------
# Fetch OMDB
# -------------------------------------------------------------------
def fetch_omdb_rating(imdb_id)
  url = URI("https://www.omdbapi.com/?i=#{imdb_id}&apikey=#{ENV['OMDB_API_KEY']}")
  response = Net::HTTP.get(url)
  JSON.parse(response)
end

# -------------------------------------------------------------------
# Get rating (cache → OMDB API)
# -------------------------------------------------------------------
def get_rating(tmdb_id, imdb_id, ratings_cache)
  key = tmdb_id.to_s

  # Use cached if exists and valid
  if ratings_cache.key?(key)
    cached = ratings_cache[key]
    return cached unless cached.values_at("imdb", "metascore", "rt").all? { |v| v.nil? }
  end

  puts "Fetching OMDB rating for #{imdb_id}"

  attempts = 0
  rating = nil

  while attempts < 4
    attempts += 1
    data = fetch_omdb_rating(imdb_id)

    rating = {
      "imdb_id"    => imdb_id,
      "metascore"  => (data["Metascore"] == "N/A" ? nil : data["Metascore"].to_i),
      "imdb"       => (data["imdbRating"] == "N/A" ? nil : data["imdbRating"].to_f),
      "rt"         => extract_rotten(data),
      "fetched_at" => Time.now.utc.iso8601
    }

    # VALIDATION: Only accept rating if not completely empty
    if rating["imdb"] || rating["metascore"] || rating["rt"]
      break
    end

    puts "  -> Empty rating, retrying #{attempts}/4..."
    sleep 1
  end

  # Cache final result (even if partial)
  ratings_cache[key] = rating

  # Rate limit to avoid OMDB throttle
  #sleep 0.1

  rating
end

# -------------------------------------------------------------------
# Fetch genres from TMDB
# -------------------------------------------------------------------
genre_data = tmdb_get("https://api.themoviedb.org/3/genre/movie/list?language=#{LANGUAGE}")

GENRE_ID_TO_NAME = genre_data["genres"].each_with_object({}) { |g, map| map[g["id"]] = g["name"] }
GENRE_NAME_TO_ID = genre_data["genres"].each_with_object({}) { |g, map| map[g["name"].downcase] = g["id"] }

WITH_GENRE_IDS = WITH_GENRES.map { |name| GENRE_NAME_TO_ID[name.downcase] }.compact
puts "Using genre filters: #{WITH_GENRE_IDS.inspect}"

# -------------------------------------------------------------------
# Discover URL
# -------------------------------------------------------------------
def discover_url(page)
  base = "https://api.themoviedb.org/3/discover/movie"

  params = {
    "include_adult" => ADULT,
    "include_video" => VIDEO,
    "language" => LANGUAGE,
    "page" => page,
    "primary_release_date.gte" => "#{START_YEAR}-01-01",
    "primary_release_date.lte" => "#{END_YEAR}-12-31",
    "vote_average.gte" => VOTE_AVG_MIN,
    "vote_count.gte" => VOTE_COUNT_MIN,
    "sort_by" => SORT_BY,
  }

  params["with_genres"] = WITH_GENRE_IDS.join(",") unless WITH_GENRE_IDS.empty?

  query = params.map { |k, v| "#{k}=#{v}" }.join("&")
  "#{base}?#{query}"
end

# -------------------------------------------------------------------
# Fetch movies
# -------------------------------------------------------------------
movies = []
(1..PAGES).each do |page|
  puts "Fetching page #{page}/#{PAGES}..."
  data = tmdb_get(discover_url(page))
  movies.concat(data["results"])
end

puts "Total movies fetched: #{movies.size}"

# -------------------------------------------------------------------
# IMDB id
# -------------------------------------------------------------------
def imdb_id_for(movie_id)
  data = tmdb_get("https://api.themoviedb.org/3/movie/#{movie_id}/external_ids")
  data["imdb_id"]
end

# -------------------------------------------------------------------
# Credits
# -------------------------------------------------------------------
def credits_for(movie_id)
  tmdb_get("https://api.themoviedb.org/3/movie/#{movie_id}/credits")
end

# -------------------------------------------------------------------
# Build Catalog Items
# -------------------------------------------------------------------
catalog = movies.map do |m|
  imdb = imdb_id_for(m["id"])
  credits = credits_for(m["id"])

  # Directors
  directors = credits["crew"]
                .select { |c| c["job"] == "Director" }
                .map { |d| d["name"] }
                .first(4)

  # Cast
  cast = credits["cast"]
          .map { |actor| actor["name"] }
          .first(4)

  # ----- NEW: Ratings -----
  rating = get_rating(m["id"], imdb, ratings_cache)
  
  imdb_raw = rating["imdb"]
  imdb_scaled = imdb_raw ? imdb_raw * 10 : 0
  meta = rating["metascore"]
  rt = rating["rt"]
  
  final_score = 
    if meta && rt
      (imdb_scaled * 0.5) + (meta *0.3) + (rt*0.2)
    elsif meta
      (imdb_scaled * 0.7) + (meta *0.3)
    elsif rt
      (imdb_scaled * 0.7) + (rt * 0.3)
    elsif imdb_raw
      imdb_scaled
    else
     0
    end
  {
    id: imdb || m["id"].to_s,
    type: "movie",
    name: m["title"],
    poster: "https://pgcatalogs.duckdns.org/posters/#{m['id']}.jpg",
    description: m["overview"],
    year: m["release_date"]&.split("-")&.first,
    genres: m["genre_ids"].map { |gid| GENRE_ID_TO_NAME[gid] }.compact,
    director: directors,
    cast: cast,

    # ----- NEW FIELDS -----
    metascore: rating["metascore"],
    imdb_rating: rating["imdb"],
    rotten_tomatoes: rating["rt"],
    final_critic_score: final_score.round(1)
  }
end
# ----------------------------------------------------------------------
# Final Critic Rating Filter
# ----------------------------------------------------------------------
catalog.select! do |item|
  score = item[:final_critic_score] || item["final_critic_score"]
  score && score >= MIN_CRITIC_SCORE
end

catalog.sort_by! do |item|
  score = item[:final_critic_score] || item["final_critic_score"] || 0
  -score
end


# -------------------------------------------------------------------
# Save Catalog
# -------------------------------------------------------------------
File.write("data/catalogs/#{CATALOG_NAME}.json", JSON.pretty_generate(catalog))
puts "Saved #{CATALOG_NAME}.json with #{catalog.size} movies."

# -------------------------------------------------------------------
# SAVE RATING CACHE
# -------------------------------------------------------------------
File.write(RATINGS_FILE, JSON.pretty_generate(ratings_cache))
puts "Updated ratings.json with #{ratings_cache.size} items."

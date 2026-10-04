// Banque de questions HEARTDRIVE
// type: 'open' (réponse libre) | 'yesno' (oui / non)
// kw: mots-clés (anglais) utilisés en secours pour la recherche d'image

const THEMES = {
  musique:     { label: 'Musique',        icon: '🎸', color: '#ff2fd6', kw: 'music concert' },
  films:       { label: 'Films',          icon: '🎬', color: '#ffb400', kw: 'cinema movie' },
  series:      { label: 'Séries',         icon: '📺', color: '#7b5cff', kw: 'tv series' },
  livres:      { label: 'Livres',         icon: '📚', color: '#c8a35a', kw: 'books library' },
  bd:          { label: 'BD',             icon: '💥', color: '#ff5a36', kw: 'comic book' },
  mangas:      { label: 'Mangas',         icon: '🍥', color: '#ff4f8b', kw: 'manga anime' },
  jeuxvideo:   { label: 'Jeux vidéo',     icon: '🎮', color: '#00e5ff', kw: 'video game' },
  voitures:    { label: 'Voitures',       icon: '🏎️', color: '#39ff14', kw: 'sports car' },
  motos:       { label: 'Motos',          icon: '🏍️', color: '#ff7a00', kw: 'motorcycle' },
  voyages:     { label: 'Voyages',        icon: '✈️', color: '#2fd4ff', kw: 'travel landscape' },
  sports:      { label: 'Sports',         icon: '⚽', color: '#5dff8f', kw: 'sport' },
  nourriture:  { label: 'Nourriture',     icon: '🍜', color: '#ffcf33', kw: 'food dish' },
  restaurants: { label: 'Restaurants',    icon: '🍽️', color: '#ff9966', kw: 'restaurant' },
  anecdotes:   { label: 'Anecdotes',      icon: '📜', color: '#e8d3a2', kw: 'memories vintage' },
  animaux:     { label: 'Animaux',        icon: '🐾', color: '#9cff57', kw: 'animal' },
  balades:     { label: 'Balades',        icon: '🌳', color: '#6be585', kw: 'walk park' },
  randonnee:   { label: 'Randonnée',      icon: '🥾', color: '#b5e655', kw: 'hiking trail' },
  urbex:       { label: 'Urbex',          icon: '🏚️', color: '#a0a0a0', kw: 'abandoned building' },
  ski:         { label: 'Ski',            icon: '⛷️', color: '#bfefff', kw: 'ski snow' },
  skate:       { label: 'Skate',          icon: '🛹', color: '#ff3b3b', kw: 'skateboard' },
  fleurs:      { label: 'Fleurs',         icon: '🌸', color: '#ff9ad5', kw: 'flowers' },
  montagne:    { label: 'Montagne',       icon: '🏔️', color: '#8fb8ff', kw: 'mountain' },
  mer:         { label: 'Mer',            icon: '🌊', color: '#00b3ff', kw: 'sea ocean' },
  tatouages:   { label: 'Tatouages',      icon: '🖋️', color: '#d64dff', kw: 'tattoo' },
};

const Q = (theme, type, q, kw) => ({ theme, type, q, kw: kw || THEMES[theme].kw });

const QUESTIONS = [
  // MUSIQUE
  Q('musique', 'open', "Quel est l'album que tu pourrais écouter en boucle sans jamais te lasser ?", 'vinyl album'),
  Q('musique', 'open', "Le meilleur concert de ta vie, c'était qui et où ?", 'concert crowd'),
  Q('musique', 'yesno', "Tu chantes à tue-tête dans ta voiture ou sous la douche ?", 'singing'),
  Q('musique', 'open', "Quelle chanson te ramène direct à tes 15 ans ?", 'cassette tape'),
  Q('musique', 'yesno', "Tu as déjà joué d'un instrument de musique ?", 'musical instrument'),
  Q('musique', 'open', "Ton plaisir coupable musical, celui que tu n'avoues à personne ?", 'headphones'),
  Q('musique', 'yesno', "Festival boueux sous la tente : partante / partant ?", 'music festival'),
  Q('musique', 'open', "Si ta vie avait une bande-son, quel serait le titre du générique ?", 'music'),
  Q('musique', 'open', "Quel artiste rêverais-tu de voir en live ?", 'stage lights'),

  // FILMS
  Q('films', 'open', "Le film que tu as vu le plus de fois ?", 'cinema'),
  Q('films', 'yesno', "Tu pleures devant les films ?", 'cinema'),
  Q('films', 'open', "Le film qui t'a fait le plus peur ?", 'horror'),
  Q('films', 'yesno', "Ciné en VO plutôt qu'en VF ?", 'movie theater'),
  Q('films', 'open', "Dans quel univers de film aimerais-tu vivre une semaine ?", 'fantasy'),
  Q('films', 'open', "Ton duo / couple de cinéma préféré ?", 'film couple'),
  Q('films', 'yesno', "Tu supportes qu'on parle pendant un film ?", 'popcorn'),
  Q('films', 'open', "Le film que tout le monde adore mais que tu trouves surcoté ?", 'movie'),

  // SÉRIES
  Q('series', 'open', "La série que tu as binge-watchée le plus vite ?", 'television'),
  Q('series', 'yesno', "Tu regardes l'épisode suivant 'juste un dernier' à 2h du mat' ?", 'night tv'),
  Q('series', 'open', "Le personnage de série dont tu te sens le plus proche ?", 'tv'),
  Q('series', 'open', "La fin de série qui t'a le plus déçu·e ?", 'tv screen'),
  Q('series', 'yesno', "Tu revois en boucle une série 'doudou' ?", 'sofa tv'),
  Q('series', 'open', "Quelle série tu conseilles à tout le monde ?", 'streaming'),
  Q('series', 'yesno', "Spoiler un ami : crime impardonnable ?", 'tv'),
  Q('series', 'open', "Dans quelle série tu aimerais avoir un petit rôle ?", 'television set'),

  // LIVRES
  Q('livres', 'open', "Le livre qui t'a marqué·e pour la vie ?", 'book'),
  Q('livres', 'yesno', "Papier plutôt que liseuse ?", 'paper book'),
  Q('livres', 'open', "Ce que tu lis en ce moment (ou la dernière lecture) ?", 'reading'),
  Q('livres', 'yesno', "Tu lis la fin d'un livre avant de l'avoir terminé ?", 'book'),
  Q('livres', 'open', "Un personnage de roman que tu aimerais rencontrer ?", 'novel'),
  Q('livres', 'open', "Ton endroit idéal pour lire ?", 'reading nook'),
  Q('livres', 'yesno', "Tu cornes les pages ?", 'old book'),
  Q('livres', 'open', "Le livre que tu offrirais à quelqu'un que tu veux connaître ?", 'gift book'),

  // BD
  Q('bd', 'open', "La BD de ton enfance que tu relis encore ?", 'comic'),
  Q('bd', 'yesno', "Astérix plutôt que Tintin ?", 'comic strip'),
  Q('bd', 'open', "Ton super-héros (ou héroïne) préféré·e ?", 'superhero'),
  Q('bd', 'yesno', "Tu as déjà fait dédicacer une BD ?", 'comic book'),
  Q('bd', 'open', "Un dessinateur ou un style graphique qui te fascine ?", 'illustration'),
  Q('bd', 'yesno', "Le Festival d'Angoulême, tu y es déjà allé·e ?", 'comic festival'),
  Q('bd', 'open', "Si ta vie était une BD, quel serait son titre ?", 'comic panel'),
  Q('bd', 'open', "Quel pouvoir de super-héros choisirais-tu ?", 'superpower'),

  // MANGAS
  Q('mangas', 'open', "Ton manga / anime préféré de tous les temps ?", 'anime'),
  Q('mangas', 'yesno', "Tu as déjà regardé un anime en entier en un week-end ?", 'anime'),
  Q('mangas', 'open', "Quel perso de manga te ressemble le plus ?", 'manga character'),
  Q('mangas', 'yesno', "Ghibli peut tout résoudre ?", 'japanese animation'),
  Q('mangas', 'open', "L'opening d'anime qui te met la chair de poule ?", 'anime'),
  Q('mangas', 'yesno', "Tu lis les mangas dans le sens japonais sans galérer ?", 'manga'),
  Q('mangas', 'open', "Dans quel univers manga voudrais-tu te réveiller demain ?", 'tokyo'),
  Q('mangas', 'yesno', "Tu as déjà fait (ou rêvé de faire) un cosplay ?", 'cosplay'),

  // JEUX VIDÉO
  Q('jeuxvideo', 'open', "Le jeu vidéo qui a marqué ton enfance ?", 'retro video game'),
  Q('jeuxvideo', 'yesno', "Team console plutôt que PC ?", 'game controller'),
  Q('jeuxvideo', 'open', "Le jeu sur lequel tu as passé le plus d'heures ?", 'gaming'),
  Q('jeuxvideo', 'yesno', "Tu es mauvais·e perdant·e ?", 'arcade'),
  Q('jeuxvideo', 'open', "Ton perso de jeu vidéo préféré ?", 'video game character'),
  Q('jeuxvideo', 'yesno', "Une soirée jeux en coop à deux, ça te tente ?", 'couch gaming'),
  Q('jeuxvideo', 'open', "Le jeu que tu aimerais redécouvrir sans souvenir pour le vivre à nouveau ?", 'video game'),
  Q('jeuxvideo', 'open', "Ta console de cœur ?", 'console'),
  Q('jeuxvideo', 'yesno', "Need for Speed Underground 2 : tu y as joué ?", 'street racing night'),

  // VOITURES
  Q('voitures', 'open', "La voiture de tes rêves ?", 'dream car'),
  Q('voitures', 'yesno', "Tu aimes conduire de nuit ?", 'night drive'),
  Q('voitures', 'open', "Ta première voiture, c'était quoi ?", 'old car'),
  Q('voitures', 'yesno', "Boîte manuelle plutôt qu'automatique ?", 'gear shift'),
  Q('voitures', 'open', "Le road trip en voiture que tu rêves de faire ?", 'road trip'),
  Q('voitures', 'yesno', "Tu es du genre à laver ta voiture chaque semaine ?", 'car wash'),
  Q('voitures', 'open', "La musique parfaite pour rouler la nuit ?", 'highway night'),
  Q('voitures', 'yesno', "Néons sous la caisse : stylé ou kitsch ? (oui = stylé)", 'neon car'),

  // MOTOS
  Q('motos', 'yesno', "Tu es déjà monté·e sur une moto ?", 'motorcycle'),
  Q('motos', 'open', "La moto (ou le scooter) de tes rêves ?", 'motorbike'),
  Q('motos', 'yesno', "Passager·e sur une moto, ça te fait envie ?", 'motorcycle ride'),
  Q('motos', 'open', "Roadster, sportive, custom ou trail ?", 'custom motorcycle'),
  Q('motos', 'yesno', "Tu as (ou voudrais) le permis moto ?", 'motorcycle'),
  Q('motos', 'open', "La route de rêve à faire à moto ?", 'mountain road'),
  Q('motos', 'yesno', "Le blouson en cuir, c'est la base ?", 'leather jacket'),

  // VOYAGES
  Q('voyages', 'open', "Le plus beau voyage que tu aies fait ?", 'travel'),
  Q('voyages', 'open', "Le pays où tu rêves d'aller ?", 'destination'),
  Q('voyages', 'yesno', "Voyage improvisé plutôt qu'organisé ?", 'backpack'),
  Q('voyages', 'yesno', "Tu as déjà voyagé seul·e ?", 'solo travel'),
  Q('voyages', 'open', "L'objet que tu emportes toujours en voyage ?", 'suitcase'),
  Q('voyages', 'yesno', "Train de nuit plutôt qu'avion ?", 'night train'),
  Q('voyages', 'open', "La ville où tu pourrais tout plaquer pour vivre ?", 'city skyline'),
  Q('voyages', 'open', "Ta pire galère en voyage ?", 'airport'),
  Q('voyages', 'yesno', "Van aménagé et liberté totale : ça te parle ?", 'camper van'),

  // SPORTS
  Q('sports', 'open', "Le sport que tu pratiques (ou pratiquais) ?", 'sport'),
  Q('sports', 'yesno', "Tu regardes du sport à la télé ?", 'stadium'),
  Q('sports', 'open', "Un sport que tu rêves d'essayer ?", 'extreme sport'),
  Q('sports', 'yesno', "Salle de sport plutôt que sport en extérieur ?", 'gym'),
  Q('sports', 'open', "Ton plus grand exploit sportif ?", 'victory'),
  Q('sports', 'yesno', "Tu es plutôt compétition que plaisir ?", 'race'),
  Q('sports', 'open', "Le sportif ou la sportive qui t'inspire ?", 'athlete'),
  Q('sports', 'yesno', "Un footing à 7h du matin, ça te paraît possible ?", 'running sunrise'),

  // NOURRITURE
  Q('nourriture', 'open', "Ton plat préféré absolu ?", 'delicious food'),
  Q('nourriture', 'yesno', "Ananas sur la pizza ?", 'pineapple pizza'),
  Q('nourriture', 'open', "Le plat que tu cuisines le mieux ?", 'cooking'),
  Q('nourriture', 'yesno', "Sucré plutôt que salé ?", 'dessert'),
  Q('nourriture', 'open', "Un aliment que tu détestes ?", 'vegetables'),
  Q('nourriture', 'yesno', "Tu aimes la cuisine très épicée ?", 'chili pepper'),
  Q('nourriture', 'open', "Ton petit-déj idéal ?", 'breakfast'),
  Q('nourriture', 'open', "Le dernier repas de ta vie, ce serait quoi ?", 'feast'),
  Q('nourriture', 'yesno', "Fromage à tous les repas : oui chef ?", 'cheese'),

  // RESTAURANTS
  Q('restaurants', 'open', "Ton resto préféré (et ce que tu y prends) ?", 'restaurant'),
  Q('restaurants', 'yesno', "Tu commandes toujours la même chose au resto ?", 'menu'),
  Q('restaurants', 'open', "Le type de cuisine du monde que tu préfères ?", 'world cuisine'),
  Q('restaurants', 'yesno', "Street food plutôt que resto gastronomique ?", 'street food'),
  Q('restaurants', 'open', "Le meilleur repas que tu aies mangé en voyage ?", 'local food'),
  Q('restaurants', 'yesno', "Tu goûtes dans l'assiette des autres ?", 'sharing food'),
  Q('restaurants', 'open', "Un resto où tu rêverais d'emmener quelqu'un ?", 'romantic dinner'),
  Q('restaurants', 'yesno', "Brunch du dimanche : religion ?", 'brunch'),

  // ANECDOTES
  Q('anecdotes', 'open', "Ton anecdote la plus improbable ?", 'surprise'),
  Q('anecdotes', 'open', "Le truc le plus fou que tu aies fait sur un coup de tête ?", 'adventure'),
  Q('anecdotes', 'yesno', "Tu as déjà été pris·e d'un fou rire à un moment très mal choisi ?", 'laughing'),
  Q('anecdotes', 'open', "Ta plus grosse honte (qui te fait rire aujourd'hui) ?", 'embarrassed'),
  Q('anecdotes', 'yesno', "Tu as déjà rencontré une célébrité ?", 'celebrity'),
  Q('anecdotes', 'open', "Le métier que tu voulais faire enfant ?", 'childhood'),
  Q('anecdotes', 'open', "Un souvenir d'enfance qui te fait sourire ?", 'childhood memories'),
  Q('anecdotes', 'yesno', "Tu crois au destin ?", 'stars night sky'),
  Q('anecdotes', 'open', "Ton talent caché ?", 'talent'),

  // ANIMAUX
  Q('animaux', 'yesno', "Team chat plutôt que chien ?", 'cat'),
  Q('animaux', 'open', "Ton animal préféré ?", 'cute animal'),
  Q('animaux', 'open', "Tu as (ou as eu) un animal ? Raconte !", 'pet'),
  Q('animaux', 'yesno', "Tu as peur des araignées ?", 'spider'),
  Q('animaux', 'open', "Si tu étais un animal, tu serais lequel ?", 'wild animal'),
  Q('animaux', 'yesno', "Nager avec des dauphins, ça te tente ?", 'dolphin'),
  Q('animaux', 'open', "L'animal le plus étonnant que tu aies vu en vrai ?", 'wildlife'),
  Q('animaux', 'yesno', "Tu parles à voix haute aux animaux ?", 'dog'),

  // BALADES
  Q('balades', 'open', "Ta balade préférée près de chez toi ?", 'walk'),
  Q('balades', 'yesno', "Balade sous la pluie : romantique ?", 'rain walk'),
  Q('balades', 'open', "Le meilleur moment de la journée pour se balader ?", 'golden hour'),
  Q('balades', 'yesno', "Tu te balades avec de la musique dans les oreilles ?", 'walking headphones'),
  Q('balades', 'open', "La ville la plus agréable à arpenter à pied ?", 'old town street'),
  Q('balades', 'yesno', "Balade de nuit en ville : oui ?", 'city night'),
  Q('balades', 'open', "Forêt, bord de lac, quais ou campagne ?", 'forest path'),

  // RANDONNÉE
  Q('randonnee', 'yesno', "Tu as déjà fait une rando de plusieurs jours ?", 'trekking'),
  Q('randonnee', 'open', "La plus belle rando que tu aies faite ?", 'hiking'),
  Q('randonnee', 'yesno', "Bivouac à la belle étoile : partant·e ?", 'camping stars'),
  Q('randonnee', 'open', "Le GR ou le trek dont tu rêves ?", 'trek'),
  Q('randonnee', 'yesno', "Lever à 4h pour voir le lever de soleil au sommet ?", 'sunrise summit'),
  Q('randonnee', 'open', "Ce qu'il y a toujours dans ton sac de rando ?", 'backpack hiking'),
  Q('randonnee', 'yesno', "Tu préfères la rando à plusieurs plutôt que seul·e ?", 'hikers group'),

  // URBEX
  Q('urbex', 'yesno', "Tu as déjà exploré un lieu abandonné ?", 'abandoned'),
  Q('urbex', 'open', "Le lieu abandonné que tu rêverais d'explorer ?", 'abandoned castle'),
  Q('urbex', 'yesno', "Urbex de nuit : frisson ou panique ? (oui = frisson)", 'abandoned night'),
  Q('urbex', 'open', "Usine, château, hôpital, parc d'attractions... ton favori ?", 'abandoned factory'),
  Q('urbex', 'yesno', "Tu crois aux fantômes ?", 'ghost'),
  Q('urbex', 'open', "Ta photo d'urbex idéale ressemblerait à quoi ?", 'urban decay'),
  Q('urbex', 'yesno', "Tu respectes la règle 'ne rien prendre, ne rien casser' ?", 'ruins'),

  // SKI
  Q('ski', 'yesno', "Ski plutôt que snowboard ?", 'skiing'),
  Q('ski', 'open', "Ta station de ski préférée ?", 'ski resort'),
  Q('ski', 'yesno', "Hors-piste, ça te tente ?", 'powder snow'),
  Q('ski', 'open', "Ta meilleure (ou pire) chute en ski ?", 'ski fall'),
  Q('ski', 'yesno', "L'après-ski compte plus que le ski ?", 'chalet fondue'),
  Q('ski', 'open', "Raclette, fondue ou tartiflette ?", 'raclette'),
  Q('ski', 'yesno', "Tu as déjà dévalé une piste noire ?", 'ski slope'),

  // SKATE
  Q('skate', 'yesno', "Tu as déjà fait du skate ?", 'skateboard'),
  Q('skate', 'open', "Le trick que tu rêverais de maîtriser ?", 'skateboard trick'),
  Q('skate', 'yesno', "Tony Hawk's Pro Skater : tu connais par cœur ?", 'skatepark'),
  Q('skate', 'open', "Skate, roller, longboard ou trottinette ?", 'longboard'),
  Q('skate', 'yesno', "Tu traînerais dans un skatepark juste pour regarder ?", 'skatepark'),
  Q('skate', 'open', "Ton style vestimentaire, plutôt streetwear ou autre ?", 'streetwear'),
  Q('skate', 'yesno', "Tu as un jour cassé quelque chose en glissant sur un truc à roulettes ?", 'skate'),

  // FLEURS
  Q('fleurs', 'open', "Ta fleur préférée ?", 'flower'),
  Q('fleurs', 'yesno', "Tu aimes recevoir des fleurs ?", 'bouquet'),
  Q('fleurs', 'yesno', "Tu as la main verte ?", 'houseplants'),
  Q('fleurs', 'open', "Le jardin ou le parc fleuri le plus beau que tu aies vu ?", 'flower garden'),
  Q('fleurs', 'yesno', "Champ de lavande en Provence : obligatoire une fois dans sa vie ?", 'lavender field'),
  Q('fleurs', 'open', "Une odeur de fleur qui te rappelle un souvenir ?", 'blossom'),
  Q('fleurs', 'yesno', "Cerisiers en fleurs au Japon : rêve ?", 'cherry blossom'),

  // MONTAGNE
  Q('montagne', 'yesno', "Team montagne plutôt que mer ?", 'mountain'),
  Q('montagne', 'open', "Le plus beau sommet / panorama que tu aies vu ?", 'mountain panorama'),
  Q('montagne', 'yesno', "Un week-end dans un refuge sans réseau : oui ?", 'mountain hut'),
  Q('montagne', 'open', "Le massif où tu aimerais passer un été ?", 'alps'),
  Q('montagne', 'yesno', "Tu as le vertige ?", 'cliff'),
  Q('montagne', 'open', "Chalet au bord d'un lac ou cabane perchée ?", 'mountain lake cabin'),
  Q('montagne', 'yesno', "Via ferrata ou escalade, tu as déjà testé ?", 'climbing'),

  // MER
  Q('mer', 'open', "Ta plage préférée au monde ?", 'beach'),
  Q('mer', 'yesno', "Tu te baignes même quand l'eau est froide ?", 'cold sea'),
  Q('mer', 'yesno', "Plongée ou snorkeling, déjà essayé ?", 'snorkeling'),
  Q('mer', 'open', "Ton activité de bord de mer préférée ?", 'seaside'),
  Q('mer', 'yesno', "Coucher de soleil sur la mer > lever de soleil en montagne ?", 'sunset ocean'),
  Q('mer', 'open', "Surf, voile, paddle ou serviette ?", 'surfing'),
  Q('mer', 'yesno', "Tu rêves de vivre au bord de l'océan ?", 'ocean house'),
  Q('mer', 'open', "Atlantique, Méditerranée ou mer tropicale ?", 'tropical sea'),

  // TATOUAGES
  Q('tatouages', 'yesno', "Tu as un (ou des) tatouage(s) ?", 'tattoo'),
  Q('tatouages', 'open', "Raconte l'histoire d'un de tes tatouages (ou celui que tu voudrais) ?", 'tattoo art'),
  Q('tatouages', 'yesno', "Tu as déjà regretté un tatouage ou un piercing ?", 'tattoo'),
  Q('tatouages', 'open', "Le style de tatouage qui te plaît le plus ?", 'tattoo design'),
  Q('tatouages', 'yesno', "Un tatouage assorti avec quelqu'un : tu pourrais ?", 'matching tattoo'),
  Q('tatouages', 'open', "Si tu devais te faire tatouer un mot, ce serait lequel ?", 'lettering tattoo'),
  Q('tatouages', 'yesno', "Tu trouves les tatouages attirants chez quelqu'un ?", 'tattooed arm'),
];

QUESTIONS.forEach((q, i) => { q.id = i + 1; });

module.exports = { THEMES, QUESTIONS };

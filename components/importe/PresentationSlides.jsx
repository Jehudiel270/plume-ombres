// ============================================================
// IMPORTÉ (inventaire 01/10/2026) — code de Carrel, projet
// "cheetah-speed-presentation" (Vite + React 18 + Tailwind 3).
// Source : C:\Users\dosso\Desktop\application\src\App.jsx
// (dossier dupliqué à l'identique : "application - Copie").
// Copie VERBATIM. Dépendances : react + lucide-react (déjà dans
// Plume d'Ombres). AUCUN import depuis une page : namespace isolé.
// Adaptations requises : voir TODO-COMPOSANTS-REUTILISABLES.md §2.
// ============================================================
import React, { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Zap,
  MapPin,
  Phone,
  Users,
  TrendingUp,
  Leaf,
  Calendar,
  DollarSign,
} from "lucide-react";

const Presentation = () => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const nextSlide = () => setCurrentSlide((prev) => (prev + 1) % slides.length);
  const prevSlide = () =>
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === "ArrowRight") nextSlide();
      if (e.key === "ArrowLeft") prevSlide();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const slides = [
    // Slide 1
    {
      title: "Cheetah Speed",
      content: (
        <div className="flex flex-col items-center justify-center h-full text-center px-8">
          <Zap className="w-32 h-32 text-yellow-400 mb-6" />
          <h1 className="text-6xl font-bold text-white mb-6">Cheetah Speed</h1>
          <p className="text-3xl text-yellow-400 mb-8">
            Projet innovant de mobilité urbaine pour tokpa-tokpa
          </p>
          <p className="text-2xl text-gray-300 mb-4">
            Entreprise :{" "}
            <span className="text-yellow-400 font-semibold">Diel Lynx</span>
          </p>
          <p className="text-xl text-gray-400 italic mt-8">
            "La vision qui révèle ce que les autres ne voient pas"
          </p>
        </div>
      ),
    },

    // Slide 2
    {
      title: "Naissance de l'idée",
      content: (
        <div className="space-y-8 px-6">
          <div className="bg-red-900/30 p-6 rounded-lg border-l-4 border-red-500">
            <h3 className="text-2xl font-bold text-red-400 mb-3">Constat</h3>
            <p className="text-xl text-gray-300">
              Difficulté à trouver un tokpa-tokpa pour des trajets précis (ex.
              Étoile → Pahou)
            </p>
          </div>
          <div className="bg-orange-900/30 p-6 rounded-lg border-l-4 border-orange-500">
            <h3 className="text-2xl font-bold text-orange-400 mb-3">
              Problème
            </h3>
            <p className="text-xl text-gray-300">
              Lenteur des trajets due aux arrêts fréquents pour prendre de
              nouveaux passagers
            </p>
          </div>
          <div className="bg-green-900/30 p-6 rounded-lg border-l-4 border-green-500">
            <h3 className="text-2xl font-bold text-green-400 mb-3">Solution</h3>
            <p className="text-xl text-gray-300">
              Créer une plateforme numérique pour optimiser les trajets et
              améliorer la disponibilité
            </p>
          </div>
        </div>
      ),
    },

    // Slide 3
    {
      title: "Valeur ajoutée",
      content: (
        <div className="space-y-6 px-6">
          {[
            "Redynamise le sous-secteur du transport urbain dominé par les tokpa-tokpa",
            "Formalisation des conducteurs",
            "Réduction des risques d'interpellation par la police",
            "Réduction des embouteillages et optimisation des trajets",
            "Sécurité, transparence et suivi des trajets",
          ].map((text, i) => (
            <div key={i} className="bg-blue-900/20 p-5 rounded-lg">
              <p className="text-xl text-gray-200">✓ {text}</p>
            </div>
          ))}
        </div>
      ),
    },

    // Slide 4
    {
      title: "Fonctionnalités principales",
      content: (
        <div className="grid grid-cols-2 gap-6 px-6">
          <div className="bg-gradient-to-br from-blue-900/40 to-blue-800/20 p-6 rounded-lg">
            <MapPin className="w-10 h-10 text-blue-400 mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">
              Localisation GPS
            </h3>
            <p className="text-gray-300">Tokpa-tokpa en temps réel</p>
          </div>
          <div className="bg-gradient-to-br from-green-900/40 to-green-800/20 p-6 rounded-lg">
            <DollarSign className="w-10 h-10 text-green-400 mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">
              Estimation prix
            </h3>
            <p className="text-gray-300">Trajets favoris enregistrés</p>
          </div>
          <div className="bg-gradient-to-br from-purple-900/40 to-purple-800/20 p-6 rounded-lg">
            <Users className="w-10 h-10 text-purple-400 mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">
              Choix conducteur
            </h3>
            <p className="text-gray-300">Temps d'arrivée estimé (ETA)</p>
          </div>
          <div className="bg-gradient-to-br from-yellow-900/40 to-yellow-800/20 p-6 rounded-lg">
            <Phone className="w-10 h-10 text-yellow-400 mb-3" />
            <h3 className="text-lg font-bold text-white mb-2">
              Assistance vocale
            </h3>
            <p className="text-gray-300">FR / FON bilingue</p>
          </div>
          <div className="bg-gradient-to-br from-red-900/40 to-red-800/20 p-6 rounded-lg col-span-2">
            <h3 className="text-lg font-bold text-white mb-2">
              Paiement hybride & Avantages
            </h3>
            <p className="text-gray-300">
              Mobile Money, espèces, stations physiques • Réductions carburant
              via partenaires ou bornes Cheetah Speed
            </p>
          </div>
        </div>
      ),
    },

    // Slide 5
    {
      title: "Profil de l'équipe",
      content: (
        <div className="space-y-6 px-6">
          <h3 className="text-2xl font-bold text-yellow-400 mb-6">
            Collaborateurs clés
          </h3>
          <div className="grid grid-cols-2 gap-4">
            {[
              "Développeurs back-end / front-end / mobile",
              "UX/UI designer",
              "Ingénieur géolocalisation / back-office",
              "Responsable partenariats & opérations",
              "Support client bilingue (FR/FON)",
              "Community / growth manager",
            ].map((role, i) => (
              <div key={i} className="bg-gray-800/50 p-4 rounded-lg">
                <p className="text-lg text-gray-200">• {role}</p>
              </div>
            ))}
          </div>
          <div className="bg-yellow-900/20 p-5 rounded-lg border-l-4 border-yellow-500 mt-8">
            <p className="text-xl text-yellow-400 font-semibold">
              Qualités essentielles : coder, sociable, organisé, orienté service
              client
            </p>
          </div>
        </div>
      ),
    },

    // Slide 6
    {
      title: "Adéquation projet / entrepreneur",
      content: (
        <div className="space-y-8 px-6">
          <div className="bg-gradient-to-r from-blue-900/40 to-purple-900/40 p-8 rounded-lg">
            <h3 className="text-2xl font-bold text-white mb-4">
              Un projet qui allie
            </h3>
            <div className="space-y-4">
              <p className="text-xl text-gray-200">
                ⚡ Intelligence & programmation
              </p>
              <p className="text-xl text-gray-200">
                🔧 Technique & vision terrain
              </p>
              <p className="text-xl text-gray-200">
                👥 Fédération de talents autour d'un projet social et numérique
              </p>
            </div>
          </div>
          <div className="bg-green-900/30 p-6 rounded-lg border-l-4 border-green-500">
            <h3 className="text-2xl font-bold text-green-400 mb-3">
              Impact social
            </h3>
            <p className="text-xl text-gray-300">
              Formalisation des tokpa-tokpa et inclusion des utilisateurs
            </p>
          </div>
        </div>
      ),
    },

    // Slide 7
    {
      title: "Forme juridique",
      content: (
        <div className="space-y-8 px-6 text-center">
          <div className="bg-blue-900/30 p-8 rounded-lg inline-block">
            <h3 className="text-3xl font-bold text-blue-400 mb-4">SARL</h3>
            <p className="text-xl text-gray-300">✓ Protège le fondateur</p>
            <p className="text-xl text-gray-300">✓ Facilite les partenariats</p>
          </div>
          <div className="bg-yellow-900/30 p-8 rounded-lg inline-block mt-6">
            <h3 className="text-3xl font-bold text-yellow-400 mb-4">
              Diel Lynx
            </h3>
            <p className="text-xl text-gray-300 mb-4">
              Future entreprise de freelance professionnel
            </p>
            <p className="text-lg text-gray-400 italic">
              "La vision qui révèle ce que les autres ne voient pas"
            </p>
          </div>
          <p className="text-xl text-gray-300 mt-8">
            Structure flexible et professionnelle pour piloter des projets
            innovants
          </p>
        </div>
      ),
    },

    // Slide 8
    {
      title: "Plan technique / Conception",
      content: (
        <div className="space-y-5 px-6">
          {[
            "Développement du site web responsive et de l'application mobile",
            "Système GPS + tarification + ETA + choix du conducteur",
            "Assistance vocale FR / FON",
            "Localisation mécaniciens et stations carburant",
            "Tableaux de bord conducteurs et support 24/7",
          ].map((item, i) => (
            <div key={i} className="bg-gray-800/50 p-5 rounded-lg">
              <p className="text-lg text-gray-200">{item}</p>
            </div>
          ))}
          <div className="bg-green-900/30 p-5 rounded-lg border-l-4 border-green-500">
            <p className="text-lg text-green-400 font-semibold">
              ✅ Page d'accueil déjà codée pour démonstration
            </p>
          </div>
        </div>
      ),
    },

    // Slide 9
    {
      title: "Étude commerciale",
      content: (
        <div className="space-y-6 px-6">
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-blue-900/30 p-6 rounded-lg">
              <h3 className="text-xl font-bold text-blue-400 mb-3">Clients</h3>
              <p className="text-gray-300">
                Citadins : étudiants, travailleurs, commerçants
              </p>
            </div>
            <div className="bg-purple-900/30 p-6 rounded-lg">
              <h3 className="text-xl font-bold text-purple-400 mb-3">
                Conducteurs
              </h3>
              <p className="text-gray-300">
                Tokpa-tokpa souhaitant formalisation et avantages
              </p>
            </div>
          </div>
          <div className="bg-green-900/30 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-green-400 mb-3">
              Zones de déploiement
            </h3>
            <p className="text-xl text-gray-300">
              Cotonou → Porto-Novo → Parakou
            </p>
          </div>
          <div className="bg-orange-900/30 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-orange-400 mb-3">
              Stratégie
            </h3>
            <p className="text-gray-300">
              • Partenariat avec associations de tokpa-tokpa
            </p>
            <p className="text-gray-300">
              • Campagnes radio et réseaux sociaux
            </p>
          </div>
          <div className="bg-yellow-900/30 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-yellow-400 mb-3">
              Fidélisation
            </h3>
            <p className="text-gray-300">
              Programme de réduction carburant, primes et formation
            </p>
          </div>
        </div>
      ),
    },

    // Slide 10
    {
      title: "Projections financières",
      content: (
        <div className="space-y-6 px-6">
          <div className="bg-gray-800/50 p-6 rounded-lg">
            <h3 className="text-2xl font-bold text-yellow-400 mb-4">
              Hypothèses
            </h3>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div className="bg-blue-900/30 p-4 rounded">
                <p className="text-3xl font-bold text-blue-400">15%</p>
                <p className="text-sm text-gray-400">Commission plateforme</p>
              </div>
              <div className="bg-green-900/30 p-4 rounded">
                <p className="text-3xl font-bold text-green-400">400 FCFA</p>
                <p className="text-sm text-gray-400">Ticket moyen</p>
              </div>
              <div className="bg-purple-900/30 p-4 rounded">
                <p className="text-3xl font-bold text-purple-400">500-1500</p>
                <p className="text-sm text-gray-400">Conducteurs</p>
              </div>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-gradient-to-br from-orange-900/40 to-red-900/40 p-8 rounded-lg border-2 border-orange-500">
              <h3 className="text-xl font-bold text-orange-400 mb-3">
                Scénario conservateur
              </h3>
              <p className="text-gray-400 mb-3">6 mois</p>
              <p className="text-4xl font-bold text-white">37,4 M</p>
              <p className="text-gray-400">FCFA</p>
            </div>
            <div className="bg-gradient-to-br from-green-900/40 to-emerald-900/40 p-8 rounded-lg border-2 border-green-500">
              <h3 className="text-xl font-bold text-green-400 mb-3">
                Scénario optimiste
              </h3>
              <p className="text-gray-400 mb-3">12 mois</p>
              <p className="text-4xl font-bold text-white">224,6 M</p>
              <p className="text-gray-400">FCFA</p>
            </div>
          </div>
          <p className="text-center text-sm text-gray-500 italic">
            Chiffres indicatifs, avant déduction des coûts opérationnels
          </p>
        </div>
      ),
    },

    // Slide 11
    {
      title: "Impact environnemental",
      content: (
        <div className="space-y-8 px-6">
          <Leaf className="w-20 h-20 text-green-400 mx-auto" />
          <div className="bg-blue-900/30 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-blue-400 mb-3">
              Impact direct
            </h3>
            <p className="text-lg text-gray-300">Faible (activité numérique)</p>
          </div>
          <div className="bg-orange-900/30 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-orange-400 mb-3">
              Impact indirect
            </h3>
            <p className="text-lg text-gray-300">
              Augmentation légère des émissions liée à la croissance de
              l'activité
            </p>
          </div>
          <div className="bg-green-900/30 p-6 rounded-lg">
            <h3 className="text-xl font-bold text-green-400 mb-3">Mesures</h3>
            {[
              "Sensibilisation à l'éco-conduite",
              "Promotion de carburants propres",
              "Prévision de motos électriques à long terme",
              "Optimisation des trajets pour réduire les embouteillages",
            ].map((m, i) => (
              <p key={i} className="text-gray-300">
                ✓ {m}
              </p>
            ))}
          </div>
        </div>
      ),
    },

    // Slide 12
    {
      title: "Démonstration",
      content: (
        <div className="flex flex-col items-center justify-center h-full px-6">
          <div className="bg-gradient-to-br from-yellow-900/40 to-orange-900/40 p-12 rounded-lg border-2 border-yellow-500 text-center max-w-3xl">
            <Zap className="w-24 h-24 text-yellow-400 mx-auto mb-6" />
            <h3 className="text-4xl font-bold text-white mb-6">
              Page d'accueil codée
            </h3>
            <p className="text-2xl text-gray-300 mb-6">
              Démonstration fonctionnelle disponible
            </p>
            <div className="bg-black/30 p-6 rounded-lg">
              <p className="text-xl text-yellow-400 font-mono">
                [Afficher screenshot ou URL du site web]
              </p>
              <p className="text-lg text-gray-400 mt-4">
                Interface utilisateur interactive et responsive
              </p>
            </div>
          </div>
        </div>
      ),
    },

    // Slide 13
    {
      title: "Calendrier de déploiement",
      content: (
        <div className="space-y-6 px-6">
          <div className="flex items-center mb-8">
            <Calendar className="w-16 h-16 text-yellow-400 mr-4" />
            <h3 className="text-3xl font-bold text-white">Roadmap</h3>
          </div>
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-900/40 to-blue-800/20 p-6 rounded-lg border-l-4 border-blue-500">
              <h4 className="text-xl font-bold text-blue-400 mb-2">0-6 mois</h4>
              <p className="text-lg text-gray-300">
                Finalisation site web, tests pilotes à Cotonou
              </p>
            </div>
            <div className="bg-gradient-to-r from-purple-900/40 to-purple-800/20 p-6 rounded-lg border-l-4 border-purple-500">
              <h4 className="text-xl font-bold text-purple-400 mb-2">
                6-12 mois
              </h4>
              <p className="text-lg text-gray-300">
                Développement application mobile et intégration fonctionnalités
              </p>
            </div>
            <div className="bg-gradient-to-r from-green-900/40 to-green-800/20 p-6 rounded-lg border-l-4 border-green-500">
              <h4 className="text-xl font-bold text-green-400 mb-2">
                12-24 mois
              </h4>
              <p className="text-lg text-gray-300">
                Déploiement national + stations physiques
              </p>
            </div>
          </div>
          <div className="bg-yellow-900/30 p-6 rounded-lg text-center mt-8">
            <p className="text-2xl font-bold text-yellow-400">
              Objectif : MVP finalisé en 1-2 ans
            </p>
          </div>
        </div>
      ),
    },

    // Slide 14
    {
      title: "Contact / Partenariat",
      content: (
        <div className="flex flex-col items-center justify-center h-full px-6">
          <div className="bg-gradient-to-br from-blue-900/50 to-purple-900/50 p-12 rounded-lg border-2 border-yellow-500 text-center max-w-2xl">
            <Phone className="w-20 h-20 text-yellow-400 mx-auto mb-6" />
            <h3 className="text-3xl font-bold text-white mb-8">
              Contactez-nous
            </h3>
            <p className="text-xl text-gray-300 mb-8">
              Pour collaboration, partenariat ou réalisation :
            </p>
            <div className="bg-yellow-900/30 p-6 rounded-lg mb-8">
              <p className="text-4xl font-bold text-yellow-400">0160329133</p>
            </div>
            <p className="text-gray-400 mb-4">Email / réseaux sociaux</p>
            <p className="text-2xl text-yellow-400 font-semibold mt-8">
              "Rejoignez-nous pour transformer le transport urbain au Bénin"
            </p>
          </div>
        </div>
      ),
    },

    // Slide 15
    {
      title: "Conclusion",
      content: (
        <div className="flex flex-col justify-center h-full space-y-8 px-6">
          <div className="text-center mb-6">
            <Zap className="w-24 h-24 text-yellow-400 mx-auto mb-4" />
            <h3 className="text-4xl font-bold text-white mb-4">
              Cheetah Speed
            </h3>
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="bg-blue-900/30 p-6 rounded-lg">
              <p className="text-xl text-gray-200">
                🚀 Innovation locale, inclusive et durable
              </p>
            </div>
            <div className="bg-purple-900/30 p-6 rounded-lg">
              <p className="text-xl text-gray-200">
                💻 Allie technologie, organisation et impact social
              </p>
            </div>
            <div className="bg-green-900/30 p-6 rounded-lg">
              <p className="text-xl text-gray-200">
                👥 Création d'opportunités économiques pour les tokpa-tokpa
              </p>
            </div>
            <div className="bg-yellow-900/30 p-6 rounded-lg">
              <p className="text-xl text-gray-200">
                📈 Rentabilité et croissance estimées dès la première année
              </p>
            </div>
          </div>
          <p className="text-3xl text-yellow-400 font-bold text-center mt-12">
            Merci de votre attention !
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white relative overflow-hidden">
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 p-6 flex justify-between items-center z-10">
        <h2 className="text-2xl font-bold text-yellow-400 underline">
          {slides[currentSlide].title}
        </h2>
        {/* <p className="text-sm text-gray-400">Claude • Le contenu est généré par les utilisateurs et non vérifié.</p> */}
      </div>

      {/* Slide Content */}
      <div className="h-screen flex items-center justify-center px-4">
        <div className="max-w-5xl w-full">{slides[currentSlide].content}</div>
      </div>

      {/* Navigation */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex items-center gap-8">
        <button
          onClick={prevSlide}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
        <div className="flex items-center gap-2">
          {slides.map((_, i) => (
            <div
              key={i}
              className={`h-2 transition-all duration-300 ${
                i === currentSlide ? "w-8 bg-yellow-400" : "w-2 bg-gray-600"
              } rounded-full`}
            />
          ))}
        </div>
        <button
          onClick={nextSlide}
          className="bg-blue-600 hover:bg-blue-700 text-white p-3 rounded-full shadow-lg transition"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Slide Counter */}
      <div className="absolute bottom-8 left-8 text-sm text-gray-400">
        {currentSlide + 1} / {slides.length}
      </div>

      {/* Keyboard Navigation Hint */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-xs text-gray-500">
        Utilisez les flèches ← → du clavier ou les boutons pour naviguer
      </div>
    </div>
  );
};

export default Presentation;

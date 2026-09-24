// YKS konu listesi — "Takip Şablonu" Excel dosyasındaki ders sayfalarından aktarılmıştır.
// Konu eklemek / düzenlemek için bu dosyayı değiştirmeniz yeterli.
// Not: Bir konunun ADINI değiştirirseniz o konunun kayıtlı ilerlemesi yeni isimle eşleşmez.

export type Topic = {
  id: string;
  name: string;
  sub: string; // Alt başlıklar
  desc?: string; // Açıklama / soru türü
  q?: string; // Ortalama soru sayısı
  shared?: boolean; // Soru sayısı komşu konularla ortak mı (Excel'de birleştirilmiş hücre)
};

export type Section = { id: string; title: string; exam: "TYT" | "AYT"; topics: Topic[] };
export type Course = { id: string; name: string; short: string; sections: Section[] };

type Row = [name: string, sub: string, desc?: string, q?: string, shared?: boolean];

function slug(s: string): string {
  const map: Record<string, string> = { ç: "c", ğ: "g", ı: "i", İ: "i", ö: "o", ş: "s", ü: "u", â: "a", î: "i", û: "u" };
  return s
    .toLocaleLowerCase("tr-TR")
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function section(id: string, title: string, exam: "TYT" | "AYT", rows: Row[]): Section {
  return {
    id,
    title,
    exam,
    topics: rows.map(([name, sub, desc, q, shared]) => ({
      id: `${id}.${slug(name)}`,
      name,
      sub,
      desc: desc || undefined,
      q: q || undefined,
      shared: shared || undefined,
    })),
  };
}

export const COURSES: Course[] = [
  {
    id: "turkce",
    name: "Türkçe & Edebiyat",
    short: "Türkçe",
    sections: [
      section("tyt-turkce", "TYT Türkçe", "TYT", [
        ["Sözcükte Anlam", "Gerçek, Yan, Mecaz, Terim Anlam, Sözcükler Arası Anlam İlişkileri (Eş/Zıt/Sesteş), Söz Öbekleri ve Deyimler", "Kelime düzeyinde anlam ve yorumlama", "4-5"],
        ["Cümlede Anlam", "Cümlede Kavramlar (Öznel, Nesnel, Tanım, Varsayım vb.), Cümle İlişkileri (Neden-Sonuç, Amaç-Sonuç), Cümle Yorumlama", "Cümleler arası mantıksal ilişkiler", "3-4"],
        ["Paragrafta Yapı", "Paragraf Bölme, Akışı Bozan Cümle, Paragraf Oluşturma ve Tamamlama, Cümlenin Yerini Değiştirme", "Paragrafın iskeleti ve metin düzeni", "26", true],
        ["Paragrafta Anlam", "Ana Düşünce, Yardımcı Düşünceler, Paragrafta Konu ve Başlık, Anlatım Teknikleri ve Düşünceyi Geliştirme Yolları", "Metni anlama, yorumlama ve analiz", "26", true],
        ["Ses Bilgisi", "Ünlü Düşmesi/Türemesi/Daralması, Ünsüz Yumuşaması/Benzeşmesi/Düşmesi/Türemesi, Ulama", "Ses olayları ve telaffuz kuralları", "0-1"],
        ["Yazım Kuralları", "Büyük Harflerin Kullanımı, De/Da, Ki, Mi'nin Yazımı, Birleşik Kelimelerin Yazımı, Sayıların ve Kısaltmaların Yazımı", "Doğru yazım ve imla kuralları", "2"],
        ["Noktalama İşaretleri", "Nokta, Virgül, Noktalı Virgül, İki Nokta, Kesme İşareti ve Diğer İşaretlerin Kullanım Alanları", "Cümle içi vurgu ve duraklama yönetimi", "2"],
        ["Sözcükte Yapı", "Kökler (İsim/Fiil), Ekler (Yapım ve Çekim Ekleri), Gövde, Sözcüklerin Yapı Bakımından Türleri (Basit, Türemiş, Birleşik)", "Kelimelerin türetiliş ve ek yapısı", "3", true],
        ["Sözcük Türleri", "İsim (Ad), Zamir (Adıl), Sıfat (Ön Ad), Zarf (Belirteç), Edat-Bağlaç-Ünlem, Fiiller (Eylemler) ve Ek Fiil", "Kelimelerin cümledeki görevleri", "3", true],
        ["Fiilimsiler & Fiilde Çatı", "İsim-Fiil, Sıfat-Fiil, Zarf-Fiil / Öznesine ve Nesnesine Göre Fiil Çatıları", "Eylemsiler ve eylemin nesne/özne ilişkisi", "3", true],
        ["Cümlenin Ögeleri", "Temel Ögeler (Özne, Yüklem), Yardımcı Ögeler (Nesne, Yer Tamlayıcısı, Zarf Tümleci), Cümlede Vurgu ve Ara Söz", "Cümlenin matematiksel iskeleti", "3", true],
        ["Anlatım Bozuklukları", "Anlamsal (Bağlaşıklık) ve Yapısal (Bağdaşıklık) Bakımdan Anlatım Bozuklukları", "Dilin doğru ve duru kullanımı", "-"],
      ]),
      section("ayt-edebiyat", "AYT Edebiyat", "AYT", [
        ["Şiir Bilgisi", "Nazım Biçimleri, Nazım Türleri, Ahenk Unsurları (Kafiye, Redif, Ölçü), Söz Sanatları (Edebi Sanatlar), Şiir Türleri", "Şiir analizi ve edebiyatın temel yapı taşları", "2-3"],
        ["İslamiyet Öncesi ve Geçiş Dönemi Türk Edebiyatı", "Destan, Sav, Sagu, Koşuk, Geçiş Dönemi Eserleri (Kutadgu Bilig, Divanü Lügati't-Türk, Atabetü'l Hakayık, Divan-ı Hikmet)", "Türk edebiyatının ilk yazılı ve sözlü ürünleri", "1"],
        ["Halk Edebiyatı", "Anonim Halk Edebiyatı, Aşık Tarzı Halk Edebiyatı, Dini-Tasavvufi Halk Edebiyatı, Önemli Temsilciler", "Halk kültürü ve sözlü geleneğin edebi yansımaları", "1-2"],
        ["Divan Edebiyatı", "Divan Şiiri Nazım Biçimleri, Divan Edebiyatı Akımları, Divan Nesri, Önemli Şairler ve Yazarlar (Fuzuli, Baki, Nedim vb.)", "Klasik Türk edebiyatının kuralları ve temsilcileri", "5-6"],
        ["Tanzimat Edebiyatı", "1. ve 2. Dönem Tanzimat Edebiyatı Özellikleri, Şiir, Roman, Tiyatro, Gazetecilik, Önemli Temsilciler", "Batı etkisinde gelişen Türk edebiyatına giriş", "1-2"],
        ["Servetifünun ve Fecriati Edebiyatı", "Edebiyat-ı Cedide Hareketi, Şiir, Roman, Fecriati Beyannamesi ve Ahmet Haşim", "Batılılaşmanın zirvesi ve bireysel temaların işlenişi", "1"],
        ["Milli Edebiyat", "Genç Kalemler, Yeni Lisan Hareketi, Şiir, Roman ve Hikaye, Önemli Temsilciler (Ömer Seyfettin, Ziya Gökalp vb.)", "Milli kaynaklara dönüş ve dilde sadeleşme", "1"],
        ["Cumhuriyet Dönemi Türk Edebiyatı (Şiir)", "Saf Şiir, Yedi Meşaleciler, Toplumcu Şiir, Garip Akımı (I. Yeni), İkinci Yeni, Milli Edebiyat Zevkini Sürdürenler", "Cumhuriyet sonrası şiirdeki çeşitlilik ve modernleşme", "1"],
        ["Cumhuriyet Dönemi Türk Edebiyatı (Roman ve Hikaye)", "Milli ve Dini Duyarlılıkları Yansıtanlar, Toplumcu Gerçekçiler, Bireyin İç Dünyasını Esas Alanlar, Modernizmi Esas Alanlar", "Farklı edebi anlayışların roman ve hikayeye yansıması", "1"],
        ["Cumhuriyet Dönemi (Tiyatro ve Öğretici Metinler)", "Cumhuriyet Dönemi Tiyatrosu, Deneme, Makale, Fıkra, Gezi Yazısı, Hatıra Önemli Temsilcileri", "Cumhuriyet döneminde düz yazı türlerinin gelişimi", "1"],
        ["Edebi Akımlar", "Klasisizm, Romantizm, Realizm, Natüralizm, Parnasizm, Sembolizm, Sürrealizm vb.", "Dünya edebiyatında ortaya çıkan sanat ve düşünce hareketleri", "1"],
      ]),
    ],
  },
  {
    id: "matematik",
    name: "Matematik & Geometri",
    short: "Matematik",
    sections: [
      section("tyt-matematik", "TYT Temel Matematik", "TYT", [
        ["Temel Kavramlar (Sayı basamakları +1)", "Rakamlar, Doğal Sayılar, Tam Sayılar, Pozitif-Negatif Sayılar, Tek-Çift Sayılar, Ardışık Sayılar", "", "4"],
        ["Bölme ve Bölünebilme", "Bölme İşlemi, Bölünebilme Kuralları (2, 3, 4, 5, 8, 9, 10, 11), Asal Sayılar, Aralarında Asal Sayılar", "", "1"],
        ["EBOB - EKOK", "En Büyük Ortak Bölen, En Küçük Ortak Kat, Periyodik Durum Problemleri", "", "0-1"],
        ["Rasyonel Sayılar", "Dört İşlem, Sıralama, Ondalık Sayılar, Devirli Ondalık Sayılar", "", "1-2"],
        ["Basit Eşitsizlikler", "Eşitsizlik Özellikleri, Aralık Kavramı, Sayı Doğrusu Gösterimi", "", "1-2"],
        ["Mutlak Değer", "Mutlak Değer Özellikleri, Mutlak Değerli Denklemler ve Eşitsizlikler", "", "1-2"],
        ["Üslü İfadeler", "Üslü Sayı Özellikleri, Üslü Denklemler, Sıralama", "", "1"],
        ["Köklü İfadeler", "Kök Dışına Çıkarma, Eşlenik Kavramı, Köklü Denklemler", "", "1"],
        ["Çarpanlara Ayırma", "Ortak Çarpan Parantezi, Özdeşlikler (İki Kare Farkı, Tam Kare), Gruplandırma", "", "-"],
        ["Denklem Çözme", "Birinci Dereceden Bir Bilinmeyenli Denklemler, Denklem Sistemleri", "", "0-1"],
        ["Oran - Orantı", "Doğru Orantı, Ters Orantı, Bileşik Orantı, Ortalamalar", "", "1"],
        ["Problemler", "Sayı-Kesir, Yaş, İşçi-Havuz, Hareket (Hız), Yüzde-Kar-Zarar, Karışım, Rutin Olmayan Problemler", "", "11-12"],
        ["Kümeler", "Küme Kavramı, Alt Küme, Kümelerde İşlemler (Birleşim, Kesişim, Fark), Kartezyen Çarpım", "", "1-2"],
        ["Mantık", "Önermeler, Bağlaçlar (ve, veya, ise, ancak ve ancak), Totoloji, Çelişki", "", "1"],
        ["Fonksiyonlar", "Fonksiyon Tanımı, Değer Bulma, Fonksiyon Türleri, Bileşke ve Ters Fonksiyon, Grafik Okuma", "", "1"],
        ["Veri ve İstatistik", "Merkezi Eğilim Ölçüleri (Mod, Medyan, Aritmetik Ortalama), Merkezi Yayılım Ölçüleri (Açıklık, Standart Sapma)", "", "1"],
        ["Permütasyon - Kombinasyon", "Sayma Kuralları, Faktöriyel, Permütasyon (Sıralama), Kombinasyon (Seçme)", "", "1"],
        ["Olasılık", "Basit Olayların Olasılığı, Koşullu Olasılık, Bağımsız Olaylar", "", "1-2"],
      ]),
      section("ayt-matematik", "AYT Matematik (TYT konuları hariç)", "AYT", [
        ["Polinomlar", "Polinom Tanımı, Derece Kavramı, Bölme ve Kalan Bulma", "", "2-3"],
        ["2. Dereceden Denklemler", "Karmaşık Sayılar, Diskriminant (Delta), Kök-Katsayı İlişkileri", "", "1-2"],
        ["Eşitsizlikler", "İkinci Dereceden Eşitsizlikler, Sistemler, Tablo Yöntemi", "", "2"],
        ["Parabol", "İkinci Dereceden Fonksiyon Grafikleri, Tepe Noktası, Simetri Ekseni", "", "1"],
        ["Logaritma", "Üstel Fonksiyonlar, Logaritma Özellikleri, Logaritmalı Denklemler ve Eşitsizlikler", "", "2-3"],
        ["Diziler", "Aritmetik Diziler, Geometrik Diziler, Toplam Sembolü", "", "2"],
        ["Trigonometri", "Birim Çember, Trigonometrik Fonksiyonlar, Toplam-Fark Formülleri, Yarım Açı, Trigonometrik Denklemler", "", "4-5"],
        ["Limit ve Süreklilik", "Limit Kavramı, Sağdan-Soldan Limit, Belirsizlikler (0/0), Süreklilik Şartı", "", "2"],
        ["Türev", "Türev Alma Kuralları, Teğet Denklemi, Artan-Azalan Fonksiyonlar, Maksimum-Minimum Problemleri", "", "4"],
        ["İntegral", "Belirsiz İntegral, Belirli İntegral, Alan Hesabı, Değişken Değiştirme", "", "4"],
      ]),
      section("geometri", "Geometri", "TYT", [
        ["Açılar ve Üçgenler", "", "", "4-5"],
        ["Çokgenler ve Dörtgenler", "Düzgün Çokgenler, Yamuk, Paralelkenar, Eşkenar Dörtgen, Dikdörtgen, Kare, Deltoid", "", "4"],
        ["Çember ve Daire", "Çemberde Açılar, Çemberde Teğet ve Kiriş, Çemberin Çevresi, Dairenin Alanı", "", "1-2"],
        ["Katı Cisimler (Uzay Geometri)", "Prizmalar, Piramitler, Koni, Silindir, Küre (Alan ve Hacim)", "", "2"],
        ["Analitik Geometri", "Noktanın Analitiği, Doğrunun Analitiği (Eğim), İki Doğru Arasındaki İlişki, Dönüşüm Geometrisi", "", "2-3"],
        ["Çemberin Analitiği", "Çember Denklemi, Çember ve Doğru Durumları", "", "1"],
      ]),
    ],
  },
  {
    id: "fizik",
    name: "Fizik",
    short: "Fizik",
    sections: [
      section("tyt-fizik", "TYT Fizik", "TYT", [
        ["Fizik Bilimine Giriş", "Fiziksel Niceliklerin Sınıflandırılması (Temel-Türetilmiş / Skaler-Vektörel), Bilim Araştırma Merkezleri", "Fiziğin alt dalları ve bilimsel yöntemlerin temeli", "0-1"],
        ["Madde ve Özellikleri", "Kütle, Hacim, Özkütle (Yoğunluk), Dayanıklılık, Adezyon ve Kohezyon, Yüzey Gerilimi, Kılcallık", "Maddenin ortak ve ayırt edici özellikleri", "1"],
        ["Hareket ve Kuvvet (TYT)", "Konum, Alınan Yol, Yer Değiştirme, Sürat, Hız, Doğrusal Hareket, Kuvvet Çeşitleri, Sürtünme Kuvveti", "Tek boyutta temel hareket ve kuvvet kavramları", "1"],
        ["İş, Enerji ve Güç (TYT)", "Mekanik İş, Güç, Kinetik ve Potansiyel Enerji, Enerjinin Korunumu, Enerji Dönüşümleri, Verim", "Günlük hayatta iş ve enerji ilişkileri", "0-1"],
        ["Isı, Sıcaklık ve Genleşme", "Isı ve Sıcaklık, İç Enerji, Termometreler, Özısı, Hal Değişimi, Isı Alışverişi, Isı İletim Yolları, Genleşme", "Termodinamik ilkeleri ve genleşme olayları", "1"],
        ["Elektrostatik", "Elektrik Yükleri, Elektriklenme Çeşitleri (Dokunma, Etki, Sürtünme), Elektroskop, Coulomb Kanunu, Topraklama", "Durgun yükler ve elektriksel kuvvetlerin temeli", "0-1"],
        ["Elektrik ve Manyetizma (TYT)", "Akım, Potansiyel Fark, Direnç (Ohm Kanunu), Seri-Paralel Devreler, Mıknatıslar ve Manyetik Alan", "Temel elektrik devreleri ve manyetik alan kavramı", "1-2"],
        ["Basınç ve Kaldırma Kuvveti", "Katı, Sıvı ve Gaz Basıncı, Açık Hava Basıncı, Durgun Sıvıların Kaldırma Kuvveti (Arşimet İlkesi)", "Akışkanların basınç dengesi ve cisimlerin yüzme şartları", "0-1"],
        ["Dalgalar (TYT)", "Dalga Hareketi Temel Kavramları, Yay, Su, Ses ve Deprem Dalgaları", "Dalgaların ilerleme hızları ve karakteristik özellikleri", "0-1"],
        ["Optik", "Aydınlanma, Gölge, Yansıma, Düz ve Küresel Aynalar, Kırılma, Renk, Mercekler, Aydınlatma Araçları", "Işığın doğası ve geometrik optik kuralları", "1-2"],
      ]),
      section("ayt-fizik", "AYT Fizik", "AYT", [
        ["Vektörler & Bağıl Hareket", "Vektörlerin Özellikleri ve Bileşkesi, Bağıl Hareket, Nehir Problemleri", "İleri mekaniğin matematiksel alt yapısı", "0-1"],
        ["Newton'ın Hareket Yasaları (Dinamik)", "Eğik Düzlem, Üst Üste Cisimler, İpli Sistemler, Sürtünmeli Yüzeylerde Dinamik", "Kuvvet ve ivme arasındaki dinamik ilişkiler", "0-1"],
        ["Bir ve İki Boyutta Hareket (Atışlar)", "Serbest Düşüş, Aşağı/Yukarı Düşey Atış, Yatay Atış, Eğik Atış", "Yer çekimi ivmesi altındaki hareket analizleri", "0"],
        ["İş, Enerji ve Çizgisel Momentum", "İleri Enerji Dönüşümleri, İtme (İmpuls), Çizgisel Momentum, Esnek ve Esnek Olmayan Çarpışmalar", "Momentumun korunumu ve çarpışma mekanikleri", "0-1"],
        ["Tork, Denge ve Kütle Merkezi", "Kuvvetin Döndürme Etkisi (Tork), Kesişen Kuvvetlerin Dengesi (Lami Teoremi), Kütle ve Ağırlık Merkezi", "Rijit cisimlerin statik dengesi", "1"],
        ["Basit Makineler", "Kaldıraç, Makara, Palanga, Eğik Düzlem, Çıkrık, Dişli Çark, Kasnak ve Vida", "Kuvvetten kazanç ve iş prensipleri", "0-1"],
        ["Elektriksel Kuvvet ve Potansiyel", "Coulomb Yasası, Elektriksel Alan, Elektriksel Potansiyel Enerji ve Potansiyel, Paralel Levhalar, Sığaçlar", "Yüklü parçacıkların alan ve enerji etkileşimleri", "1-2"],
        ["Manyetizma ve Elektromanyetik İndükleme", "Akımın Manyetik Etkisi, Manyetik Kuvvet, İndüksiyon Akımı, Alternatif Akım, Transformatörler", "Elektromanyetik dalgaların ve akımların oluşumu", "0-1"],
        ["Düzgün Çembersel Hareket", "Çembersel Hareket Kavramları, Merkezcil Kuvvet, Dönerek Öteleme, Eylemsizlik Momenti, Açısal Momentum", "Dairesel yörüngelerdeki hareketin fiziği", "1-2"],
        ["Kepler Kanunları & Harmonik Hareket", "Kütle Çekim Kuvveti, Kepler Kanunları, Basit Harmonik Hareket (Yay ve Basit Sarkaç)", "Gezegen hareketleri ve periyodik salınımlar", "0-1"],
        ["Dalga Mekaniği ve Işık Teorileri", "Işıkta Kırınım ve Girişim (Young Deneyi), Doppler Olayı, Elektromanyetik Dalgalar", "Işığın dalga modeli ve çift yarık deneyleri", "1"],
        ["Modern Fizik", "Özel Görelilik, Kuantum Teorisine Giriş, Fotoelektrik Olay, Compton Saçılması, Bohr Atom Modeli", "Göreli zaman/uzunluk ve ışık tanecik modeli", "1-2"],
        ["Modern Fiziğin Teknolojideki Uygulamaları", "Görüntüleme Teknolojileri (X-Ray, MR, PET vb.), Yarı İletkenler, Süper İletkenler, Nanoteknoloji", "20. yüzyıl fiziğinin mühendislik uygulamaları", "1"],
      ]),
    ],
  },
  {
    id: "kimya",
    name: "Kimya",
    short: "Kimya",
    sections: [
      section("tyt-kimya", "TYT Kimya", "TYT", [
        ["Kimya Bilimi", "Simyadan Kimyaya, Kimyanın Alt Dalları, Kimya Uygulamalarında İş Sağlığı ve Güvenliği, Elementler ve Bileşikler", "Kimyanın sembolik dili, laboratuvar malzemeleri ve güvenlik işaretleri", "1"],
        ["Atom ve Periyodik Sistem", "Atom Modelleri, Atomun Yapısı (Proton, Nötron, Elektron), Periyodik Sistem, Periyodik Özelliklerin Değişimi", "Atom altı tanecikler ve elementlerin periyodik tablodaki yerleşim kuralları", "0-1"],
        ["Kimyasal Türler Arası Etkileşimler", "Kimyasal Tür Kavramı, Güçlü Etkileşimler (İyonik, Kovalent, Metalik), Zayıf Etkileşimler (Van der Waals, Hidrojen Bağı)", "Maddelerin bir arada durmasını sağlayan bağlar ve fiziksel/kimyasal değişimler", "1"],
        ["Maddenin Halleri", "Katılar (Amorf, Kristal), Sıvılar (Viskozite, Buhar Basıncı, Kaynama), Gazlar, Plazma", "Maddenin fiziksel hallerinin özellikleri ve faz geçişleri", "1"],
        ["Kimyanın Temel Kanunları ve Kimyasal Hesaplamalar", "Kütlenin Korunumu, Sabit Oranlar, Katlı Oranlar, Mol Kavramı, Kimyasal Tepkimeler ve Hesaplamalar", "Kimyanın matematiksel temelleri ve miktar hesaplamaları (Ortak Konu)", "0-1"],
        ["Karışımlar (TYT)", "Homojen ve Heterojen Karışımlar, Çözünme Süreci, Derişim Birimleri (Kütlece/Hacimce Yüzde), Ayırma Teknikleri", "Karışımların sınıflandırılması ve fiziksel yöntemlerle ayrıştırılması", "1"],
        ["Asitler, Bazlar ve Tuzlar", "Asitler ve Bazların Genel Özellikleri, pH Kavramı, Nötrleşme Tepkimeleri, Tuzlar, Günlük Hayatta Asit-Baz", "İndikatörler, asit-baz tepkimeleri ve önemli tuzların kullanım alanları", "1"],
        ["Kimya Her Yerde", "Temizlik Maddeleri, Polimerler, Kozmetikler, İlaçlar, Hazır Gıdalar ve Katkı Maddeleri", "Kimyasal maddelerin günlük yaşam, endüstri ve çevre üzerindeki etkileri", "-"],
      ]),
      section("ayt-kimya", "AYT Kimya", "AYT", [
        ["Atomun Kuantum Modeli", "Kuantum Sayıları, Elektron Dizilimleri, Periyodik Özelliklerin Bloklara Göre İncelenmesi, Yükseltgenme Basamakları", "Modern atom teorisi, orbitaller ve elektronların yerleşim kuralları", "0-1"],
        ["Gazlar", "Gaz Yasaları, İdeal Gaz Denklemi, Gazlarda Kinetik Teori, Gaz Karışımları (Kısmi Basınç), Gerçek Gazlar", "Gaz davranışlarının matematiksel formüllerle incelenmesi ve faz diyagramları", "1"],
        ["Sıvı Çözeltiler ve Çözünürlük", "Derişim Birimleri (Molarite, Molalite, ppm), Koligatif Özellikler, Çözünürlük ve Çözünürlüğe Etki Eden Faktörler", "İleri derişim hesaplamaları ve çözeltilerin fiziksel değişimleri", "2"],
        ["Kimyasal Tepkimelerde Enerji", "Tepkime Entalpisi, Oluşum Entalpisi, Hess Kanunu, Bağ Enerjileri", "Tepkimelerdeki ısı değişimleri, endotermik ve ekzotermik süreçler", "1"],
        ["Kimyasal Tepkimelerde Hız", "Tepkime Hızı Kavramı, Çarpışma Teorisi, Hıza Etki Eden Faktörler (Derişim, Sıcaklık, Katalizör)", "Tepkimelerin gerçekleşme süreleri ve hız denklemlerinin yazılması", "1"],
        ["Kimyasal Tepkimelerde Denge", "Maksimum Düzensizlik ve Minimum Enerji, Denge Sabiti (Kc, Kp), Dengeye Etki Eden Faktörler (Le Chatelier)", "Tersinir tepkimelerde dinamik denge süreçleri ve sistem analizleri", "1"],
        ["Asit-Baz Dengesi (Sulu Çözeltilerde Denge)", "Brönsted-Lowry Asit-Baz Tanımı, Suyun Otoiyonizasyonu, Zayıf Asit-Baz Dengeleri (Ka, Kb), Tampon Çözeltiler, Titrasyon", "Sulu çözeltilerde gelişmiş pH hesaplamaları ve nötrleşme analizleri", "1"],
        ["Çözünme-Çökelme Dengeleri (Kçç)", "Çözünürlük Çarpımı (Kçç), Çökelme Şartları, Ortak İyon Etkisi", "Az çözünen tuzların dengesi ve çözünürlük değişimleri", "0-1"],
        ["Kimya ve Elektrik (Elektrokimya)", "Redoks Tepkimeleri, Aktiflik, Elektrokimyasal Piller (Galvanik), Nernst Eşitliği, Elektroliz ve Korozyon", "Kimyasal enerjinin elektrik enerjisine (veya tersi) dönüşüm mekanizmaları", "2-3"],
        ["Karbon Kimyasına Giriş", "Anorganik ve Organik Bileşikler, Doğada Karbon (Allotroplar), Lewis Formülleri, Hibritleşme ve Molekül Geometrileri", "Karbon atomunun bağ yapma yeteneği ve VSEPR teorisi", "1-2"],
        ["Organik Bileşikler", "Alkanlar, Alkenler, Alkinler, Aromatik Bileşikler (Arenler), Fonksiyonel Gruplar, Alkoller, Eterler, Karbonil Bileşikleri", "Organik kimya bileşiklerinin adlandırılması, özellikleri ve tepkimeleri", "2"],
        ["Enerji Kaynakları ve Bilimsel Gelişmeler", "Fosil Yakıtlar, Alternatif Enerji Kaynakları, Sürdürülebilirlik, Nanoteknoloji", "Kimyasal teknolojilerin çevreye ve geleceğe yönelik etkileri", ""],
      ]),
    ],
  },
  {
    id: "biyoloji",
    name: "Biyoloji",
    short: "Biyoloji",
    sections: [
      section("tyt-biyoloji", "TYT Biyoloji", "TYT", [
        ["Canlıların Ortak Özellikleri", "Hücresel Yapı, Beslenme, Solunum, Boşaltım, Hareket, Uyarılara Tepki, Uyum, Organizasyon, Üreme, Büyüme ve Gelişme", "Tüm canlılarda istisnasız görülen temel biyolojik faaliyetler", "0-1"],
        ["Canlıların Temel Bileşenleri", "İnorganik Bileşikler (Su, Mineraller, Asit-Baz, Tuz), Organik Bileşikler (Karbonhidrat, Lipit, Protein, Enzim, Vitamin, Nükleik Asitler, ATP)", "Hücreyi oluşturan maddelerin yapısal özellikleri ve metabolik görevleri", "1"],
        ["Hücrenin Yapısı ve İşlevleri", "Hücre Teorisi, Hücre Zarı ve Madde Geçişleri (Difüzyon, Ozmoz, Aktif Taşıma, Endositoz, Ekzositoz), Sitoplazma ve Organeller, Çekirdek", "Hücre organellerinin görevleri ve zar üzerinden madde alışveriş mekanizmaları", "1"],
        ["Canlıların Çeşitliliği ve Sınıflandırılması", "Sınıflandırma İlkeleri, Canlı Alemleri (Bakteriler, Arkeler, Protistalar, Mantarlar, Bitkiler, Hayvanlar) ve Virüsler", "Taksonomik kurallar ve 6 büyük canlı aleminin karakteristik özellikleri", "1"],
        ["Hücre Bölünmeleri ve Üreme", "Mitoz Bölünme, Eşeysiz Üreme Çeşitleri, Mayoz Bölünme, Eşeyli Üreme", "Hücre döngüsü, kromozom hareketleri ve üreme yöntemleri", "1"],
        ["Kalıtımın Temel İlkeleri (Genetik)", "Mendel İlkeleri, Monohibrit-Dihibrit Çaprazlama, Eş Baskınlık, Çok Alellilik, Kan Grupları, Eşeye Bağlı Kalıtım, Soyağaçları", "Genetik özelliklerin nesilden nesile aktarım kuralları ve olasılık hesapları", "1"],
        ["Ekosistem Ekolojisi ve Güncel Çevre Sorunları", "Ekosistemin Bileşenleri, Madde ve Enerji Akışı, Besin Zinciri ve Piramidi, Madde Döngüleri, Sera Etkisi, Erozyon, Biyoçeşitlilik", "Canlıların çevreyle etkileşimi, doğadaki döngüler ve çevre kirliliği", "1"],
      ]),
      section("ayt-biyoloji", "AYT Biyoloji", "AYT", [
        ["Sinir Sistemi", "Nöronun Yapısı, İmpuls Oluşumu ve İletimi, Merkezi ve Çevresel Sinir Sistemi, Sinir Sistemi Rahatsızlıkları", "Vücudun elektriksel denetim ve haberleşme ağı", "0-1"],
        ["Endokrin Sistem", "Hormonların Yapısı, İç Salgı Bezleri (Hipofiz, Tiroid, Pankreas vb.), Geri Bildirim (Feedback) Mekanizması", "Vücudun kimyasal düzenleyici sistemi", "1"],
        ["Duyu Organları", "Göz, Kulak, Burun, Dil, Deri Yapısı ve İşleyişi, Görme/İşitme Olayları, Duyu Organı Rahatsızlıkları", "Çevresel uyarıların alınıp merkezi sinir sistemine iletilmesi", "0-1"],
        ["Destek ve Hareket Sistemi", "İskelet Sistemi (Kemik ve Kıkırdak Dokuları), Eklemler, Kas Sistemi, Kasılma Mekanizması (Huxley Kayan İplikler)", "Vücuda şekil verme, koruma ve hareket mekaniği", "0-1"],
        ["Sindirim Sistemi", "Sindirim Organları, Mekanik ve Kimyasal Sindirim, Enzimler, Besinlerin Emilimi (Kan ve Lenf Yolu)", "Büyük besinlerin hücre zarından geçebilecek boyuta küçültülmesi", "0-1"],
        ["Dolaşım ve Bağışıklık Sistemi", "Kalbin Yapısı ve Çalışması, Kan Damarları, Kanın Yapısı, Lenf Dolaşımı, Özgül ve Özgül Olmayan Bağışıklık", "Madde taşınımı ve vücudun hastalıklara karşı savunması", "1"],
        ["Solunum Sistemi", "Solunum Organları, Alveollerde Gaz Değişimi, Oksijen ve Karbondioksit Taşınması, Bohr Etkisi", "Hücresel solunum için gerekli gaz alışverişinin sağlanması", "1"],
        ["Üriner Sistem (Boşaltım)", "Böbreklerin Yapısı, Nefronun Bölümleri, İdrar Oluşumu (Süzülme, Geri Emilim, Salgılama), Homeostazi", "Metabolik atıkların uzaklaştırılması ve su/tuz dengesi", "0-1"],
        ["Üreme Sistemi ve Embriyonik Gelişim", "Dişi ve Erkek Üreme Sistemleri, Menstrüel Döngü, Döllenme, Embriyonun Gelişim Evreleri (Segmentasyon, Gastrulasyon)", "Neslin devamlılığı ve canlının anne karnındaki gelişimi", "0"],
        ["Popülasyon ve Komünite Ekolojisi", "Komünitede Rekabet, Av-Avcı İlişkisi, Simbiyotik Yaşam (Mutualizm vb.), Süksesyon, Büyüme Eğrileri", "Belirli bir alanda yaşayan canlı gruplarının iç ve dış ilişkileri", "2"],
        ["Genden Proteine (Moleküler Genetik)", "Nükleik Asitlerin Yapısı, DNA Replikasyonu, Protein Sentezi Mekanizması (Transkripsiyon, Translasyon), Genetik Şifre", "Yönetici moleküllerin işleyişi ve hücredeki protein üretim aşamaları", "0-1"],
        ["Biyoteknoloji ve Gen Mühendisliği", "Rekombinant DNA Teknolojisi, Gen Klonlaması, PCR, Kök Hücre, Model Organizma", "Genetik mühendisliğinin modern tıp ve tarım uygulamaları", "1"],
        ["Canlılarda Enerji Dönüşümleri", "Hücresel Solunum (Oksijenli ve Oksijensiz), Fermantasyon Çeşitleri (Etil Alkol, Laktik Asit), Fotosentez, Kemosentez", "Hücrelerin enerji (ATP) üretme yolları ve organik besin sentezi", "1"],
        ["Bitki Biyolojisi", "Bitki Dokuları, Organlar (Kök, Gövde, Yaprak), Madde Taşınması (Ksilem, Floem), Bitkilerde Hormonlar, Üreme ve Çimlenme", "Gelişmiş bitkilerin anatomisi, fizyolojisi ve hayat döngüleri", "2"],
      ]),
    ],
  },
  {
    id: "tarih",
    name: "Tarih",
    short: "Tarih",
    sections: [
      section("tyt-tarih", "TYT Tarih", "TYT", [
        ["Tarih Bilimine Giriş", "Tarih ve Zaman, Kaynaklar, Takvimler", "Tarih biliminin yöntemi ve zaman algısı", "-"],
        ["İlk Çağ Medeniyetleri", "İnsanlığın İlk Dönemleri, Mezopotamya, Mısır, Anadolu ve Ege Uygarlıkları", "Yazının icadı ve ilk yerleşimler", "1"],
        ["İslamiyet Öncesi Türk Tarihi", "İlk ve Orta Çağlarda Türk Dünyası, Göktürkler, Uygurlar, Asya Hun", "Orta Asya Türk kültürü ve devlet yapısı", "0-1"],
        ["İslam Tarihi", "İslam Medeniyetinin Doğuşu, Dört Halife Dönemi, Emeviler, Abbasiler", "İslamiyet'in doğuşu ve yayılışı", "-"],
        ["İlk Türk-İslam Devletleri", "Türklerin İslamiyet'i Kabulü, Karahanlılar, Gazneliler, Büyük Selçuklu", "Türklerin İslam kültürüne entegrasyonu", "1"],
        ["Türkiye Selçuklu Devleti", "Yerleşme ve Devletleşme Sürecinde Selçuklu Türkiyesi, Haçlı Seferleri", "Anadolu'nun Türkleşmesi süreci", "1", true],
        ["Osmanlı Devleti (Kuruluş ve Yükselme)", "Beylikten Devlete (1302-1453), Dünya Gücü Osmanlı (1453-1595)", "Osmanlı'nın beylikten imparatorluğa geçişi", "1", true],
        ["Osmanlı Devleti (Duraklama ve Gerileme)", "Değişen Dünya Dengeleri Karşısında Osmanlı (1595-1774), Avrupa'daki Gelişmeler", "Osmanlı'da duraklama ve Avrupa'da rönesans/reform", "1", true],
        ["Osmanlı Devleti (Dağılma)", "Uluslararası İlişkilerde Denge Stratejisi (1774-1914), Tanzimat, Islahat", "İmparatorluğun son yüzyılı ve demokratikleşme", "1", true],
        ["Milli Mücadele Hazırlık", "20. Yüzyıl Başlarında Osmanlı, I. Dünya Savaşı, Cemiyetler, Kongreler", "Kurtuluş Savaşı'nın örgütlenme evresi", "1", true],
        ["Milli Mücadele ve Kurtuluş Savaşı", "Cepheler, Mudanya, Lozan Barış Antlaşması", "Bağımsızlık mücadelesi ve askeri zaferler", "1", true],
        ["Atatürk İlkeleri ve İnkılapları", "Siyasi, Hukuki, Eğitim ve Ekonomi Alanındaki İnkılaplar, Atatürk İlkeleri", "Modern Türkiye'nin inşası", "1", true],
      ]),
      section("ayt-tarih", "AYT Tarih", "AYT", [
        ["Tarih Bilimine Giriş", "Tarihin Konusu ve Yöntemi, Kaynak Sınıflandırması, Tarihe Yardımcı Bilim Dalları, Takvimler, Yüzyıl Hesaplamaları", "Tarih biliminin araştırma yöntemleri ve zaman-mekan algısı", "0-1"],
        ["İnsanlığın İlk Dönemleri ve Uygarlıklar", "Tarih Öncesi Çağlar, Tarihi Çağlar, Mezopotamya, Mısır, Hint, Çin, Doğu Akdeniz, Anadolu ve Ege Uygarlıkları", "Yazının icadı, ilk medeniyetlerin doğuşu ve kültürel etkileşimleri", "0-1"],
        ["İslamiyet Öncesi Türk Tarihi", "Türk Adının Anlamı, Orta Asya Kültür Merkezleri, Asya Hun, Göktürk, Uygur Devletleri, Diğer Türk Boyları, İlk Türk Devletlerinde Kültür ve Medeniyet (Devlet Yönetimi, Ordu, İnanç)", "İslamiyet öncesi Türklerin Orta Asya'daki siyasi yapıları ve yaşam tarzları", "1"],
        ["İslam Tarihi ve Uygarlığı", "İslamiyet'in Doğuşu Öncesi Dünya, Hz. Muhammed Dönemi, Dört Halife Dönemi, Emeviler, Abbasiler, Mısır'da Kurulan İlk Türk-İslam Devletleri (Tolunoğulları vb.), İslam Medeniyeti", "İslam dininin ortaya çıkışı, yayılışı ve kurulan ilk büyük devletler", "0-1"],
        ["İlk Türk-İslam Devletleri", "Türklerin İslamiyet'i Kabulü, Karahanlılar, Gazneliler, Büyük Selçuklu Devleti, Türk-İslam Kültür ve Medeniyeti (Hukuk, Toprak Yönetimi, Bilim ve Sanat)", "Türk ve İslam kültürlerinin sentezlenmesi, yeni devlet ve toplum yapısı", "1", true],
        ["Türkiye Selçuklu Devleti ve Beylikler", "Anadolu'ya Yapılan Türk Göçleri, Malazgirt Sonrası Kurulan İlk Beylikler, Türkiye (Anadolu) Selçuklu Devleti, Haçlı Seferleri, Kösedağ Savaşı ve İkinci Beylikler Dönemi", "Anadolu'nun Türkleşme ve İslamlaşma süreci, Anadolu'daki siyasi mücadeleler", "1", true],
        ["Osmanlı Devleti Siyasi Tarihi", "Beylikten Devlete (Kuruluş), Dünya Gücü Osmanlı (Yükselme), Değişen Dünya Dengeleri Karşısında Osmanlı (Duraklama ve Gerileme), Uluslararası İlişkilerde Denge Stratejisi (Dağılma)", "Osmanlı İmparatorluğu'nun padişahlar dönemindeki siyasi ve askeri gelişmeleri, önemli antlaşmalar", "2-3", true],
        ["Osmanlı Kültür ve Medeniyeti", "Merkez Teşkilatı (Divan-ı Hümayun), Taşra Teşkilatı, Toprak Sistemi (Tımar), Ordu Teşkilatı, Eğitim (Medrese), Ekonomi, Hukuk, Mimari ve Sanat", "Osmanlı'nın yüzyıllarca ayakta kalmasını sağlayan devlet mekanizması ve toplumsal düzen", "2-3", true],
        ["19. ve 20. Yüzyılda Osmanlı (Islahatlar)", "Tanzimat ve Islahat Fermanları, I. ve II. Meşrutiyet, Fikir Akımları (Osmanlıcılık, Türkçülük, İslamcılık, Batıcılık)", "İmparatorluğu dağılmaktan kurtarmak için yapılan demokratikleşme ve yenileşme hareketleri", "2-3", true],
        ["XX. Yüzyıl Başlarında Osmanlı ve I. Dünya Savaşı", "Trablusgarp Savaşı, Balkan Savaşları, I. Dünya Savaşı'nın Nedenleri, Osmanlı'nın Savaştığı Cepheler, Gizli Antlaşmalar, Mondros Ateşkes Antlaşması, Cemiyetler", "İmparatorluğun son dönemlerindeki büyük savaşlar ve yıkılış süreci", "1"],
        ["Milli Mücadele (Hazırlık Dönemi)", "İzmir'in İşgali, Mustafa Kemal'in Samsun'a Çıkışı, Amasya Genelgesi, Erzurum ve Sivas Kongreleri, Amasya Görüşmeleri, Misak-ı Milli, TBMM'nin Açılışı ve Ayaklanmalar", "Kurtuluş Savaşı'nın örgütlenme ve halkı bilinçlendirme evresi", "1-2", true],
        ["Milli Mücadele (Muharebeler ve Antlaşmalar)", "Doğu Cephesi (Gümrü), Güney Cephesi (Ankara Antlaşması), Batı Cephesi (I. ve II. İnönü, Kütahya-Eskişehir, Sakarya, Büyük Taarruz), Mudanya Ateşkesi, Lozan Barış Antlaşması", "Bağımsızlığın kazanılması için yapılan askeri savaşlar ve diplomatik başarılar", "1-2", true],
        ["Atatürk İlkeleri ve İnkılapları", "Siyasi, Hukuki, Eğitim, Toplumsal ve Ekonomik Alandaki İnkılaplar, Atatürk İlkeleri (Cumhuriyetçilik, Milliyetçilik, Halkçılık, Devletçilik, Laiklik, İnkılapçılık)", "Modern ve çağdaş Türkiye Cumhuriyeti'nin inşası, ilkelerin reformlarla eşleştirilmesi (AYT'de sık sorulur)", "1"],
        ["Atatürk Dönemi Türk Dış Politikası", "Nüfus Mübadelesi, Yabancı Okullar, Musul Sorunu, Boğazlar (Montrö), Hatay'ın Anavatana Katılması", "Cumhuriyet'in ilk yıllarında Türkiye'nin uluslararası arenadaki konumu ve diplomasisi", "-"],
      ]),
    ],
  },
  {
    id: "cografya",
    name: "Coğrafya",
    short: "Coğrafya",
    sections: [
      section("tyt-cografya", "TYT Coğrafya", "TYT", [
        ["Doğa ve İnsan", "Coğrafyanın Konusu, Bölümleri, Doğa-İnsan Etkileşimi", "Coğrafya bilimine giriş ve temel ilkeler", "-"],
        ["Dünya'nın Şekli ve Hareketleri", "Geoit Şekil, Günlük (Eksen) Hareket, Yıllık (Yörünge) Hareket ve Eksen Eğikliği", "Gezegenimizin uzaydaki konumu ve hareketlerinin sonuçları", "1", true],
        ["Coğrafi Konum", "Paralel, Meridyen, Enlem, Boylam, Yerel Saat ve Ortak Saat Hesaplamaları", "Dünya üzerinde yer bulma ve zaman hesaplamaları", "1", true],
        ["Harita Bilgisi", "Harita Elemanları, Ölçek, Projeksiyon Çeşitleri, İzohipsler (Eş Yükselti Eğrileri)", "Yeryüzü şekillerinin düzleme aktarılması ve okunması", "1", true],
        ["İklim Bilgisi", "Atmosfer ve Katmanları, Sıcaklık, Basınç, Rüzgarlar, Nem, Yağış, Büyük İklim Tipleri (Makroklima), Türkiye'nin İklimi", "Hava olayları ve dünya genelindeki iklim sistemleri", "1"],
        ["Yer'in Yapısı ve İç Kuvvetler", "Yer'in Katmanları, Levha Tektoniği, Depremler (Seizma), Volkanizma, Dağ Oluşumu (Orojenez), Kıta Oluşumu (Epirojenez)", "Dünya'nın iç yapısından kaynağını alan güçler", "0-1", true],
        ["Dış Kuvvetler", "Akarsular, Rüzgarlar, Buzullar, Dalga ve Akıntılar, Karstik Şekiller, Kıyı Tipleri", "Yeryüzünü şekillendiren dış etkenler", "0-1", true],
        ["Doğadaki Üç Unsur", "Su Kaynakları (Okyanus, Deniz, Göl, Akarsu), Toprak Tipleri ve Oluşumu, Bitki Örtüsü", "Doğal çevreyi oluşturan temel bileşenler", "1"],
        ["Nüfus ve Yerleşme", "Nüfusun Dağılışı, Nüfus Piramitleri, Yerleşme Tipleri (Kır ve Kent)", "İnsan topluluklarının dağılımı ve demografik yapı", "1", true],
        ["Göçler", "Göçün Nedenleri ve Sonuçları, Göç Çeşitleri (İç ve Dış Göçler)", "Nüfus hareketliliği", "1", true],
        ["Ekonomik Faaliyetler", "Birincil, İkincil, Üçüncül, Dördüncül ve Beşincil Ekonomik Faaliyetler", "İnsanların geçim kaynaklarının sınıflandırılması", "0-1"],
        ["Bölgeler ve Ülkeler", "Bölge Kavramı ve Türleri (Fiziki, Beşeri, Ekonomik), Ulaşım Ağları", "Ortak özelliklere göre alan sınıflandırması", "0-1"],
        ["Doğal Afetler", "Deprem, Tsunami, Heyelan, Çığ, Sel, Taşkın, Erozyon, Kuraklık, Orman Yangınları", "Doğa kaynaklı yıkıcı olaylar ve korunma yolları", "0-1"],
      ]),
      section("ayt-cografya", "AYT Coğrafya", "AYT", [
        ["Doğal Sistemler (Biyoçeşitlilik ve Ekosistem)", "Biyoçeşitlilik, Biyomlar, Ekosistemin Unsurları, Enerji Akışı, Madde Döngüleri (Karbon, Su, Azot), Su Ekosistemleri", "Canlıların yeryüzündeki dağılışı ve doğadaki kusursuz işleyiş mekanizmaları", "1"],
        ["Ekstrem Doğa Olayları ve İklim Değişimi", "Ekstrem Doğa Olayları (Meteorolojik, Jeolojik vb.), Küresel İklim Değişiminin Nedenleri ve Sonuçları", "Sıra dışı tabiat olaylarının ve küresel ısınmanın insanlığa etkileri", "0-1"],
        ["Beşeri Sistemler: Nüfus, Göç ve Yerleşme", "Ülkelerin Nüfus Politikaları, Şehirlerin Fonksiyonları ve Küresel Etki Alanları, Türkiye'de Şehirleşme, Göçlerin Nedenleri ve Mekansal Etkileri", "İnsan nüfusunun demografik yapısı, şehirlerin büyüme süreçleri ve göç hareketleri", "1"],
        ["Beşeri Sistemler: Ekonomik Faaliyetler ve Türkiye Ekonomisi", "Doğal Kaynaklar ve Ekonomi İlişkisi, Türkiye'de Tarım, Hayvancılık, Ormancılık, Türkiye'de Madenler ve Enerji Kaynakları, Türkiye'de Sanayi", "Türkiye'nin ekonomik coğrafyası, kaynakların kullanımı ve sektörel dağılım", "1-2"],
        ["Mekansal Bir Sentez: Türkiye", "Türkiye'nin Kültürel Mirası, Turizm Potansiyeli ve Politikaları, Türkiye'de Ulaşım Sistemleri, İç ve Dış Ticaret, Bölgesel Kalkınma Projeleri (GAP, KOP, DOKAP vb.)", "Ülkemizin bölgesel kalkınma hamleleri, ticari ağı ve turizm zenginlikleri", "0-1"],
        ["Küresel Ortam: Bölgeler ve Ülkeler", "İlk Kültür Merkezleri, Medeniyetlerin Merkezi Türkiye, Küresel Ticaret ve Ham Madde, Ülkeler Arası Etkileşim (Teknoloji/Turizm), Uluslararası Örgütler (BM, NATO, AB, OPEC vb.)", "Küresel çapta kurulan siyasi/ekonomik örgütler ve dünya ülkelerinin gelişmişlik analizleri", "1"],
        ["Çevre ve Toplum", "Doğal Kaynakların Bilinçsiz Kullanımı, Çevre Sorunları, Çevre Politikaları, Geri Dönüşüm, Doğal Afetler ve Afet Yönetimi", "İnsan faaliyetlerinin çevreye verdiği zararlar ve bu zararları önleme yöntemleri", "1"],
      ]),
    ],
  },
  {
    id: "felsefe",
    name: "Felsefe",
    short: "Felsefe",
    sections: [
      section("tyt-felsefe", "TYT Felsefe", "TYT", [
        ["Felsefeyi Tanıma", "Felsefenin Anlamı, Felsefi Düşüncenin Nitelikleri", "Felsefenin ne olduğu ve temel özellikleri", "1"],
        ["Felsefe ile Düşünme", "Akıl Yürütme, Argüman, Kavramlar", "Mantıksal düşünme ve dilin kullanımı", "0-1"],
        ["Felsefenin Temel Konuları", "Varlık, Bilgi, Bilim, Ahlak, Din, Siyaset, Sanat Felsefesi", "Felsefenin alt dalları ve temel problemleri", "2-3"],
        ["MÖ 6. Yüzyıl - MS 2. Yüzyıl Felsefesi", "İlk Çağ Felsefesi, Doğa Filozofları, Sokrates, Platon, Aristoteles", "Antik dönem felsefi düşünce", "0-1"],
        ["MS 2. Yüzyıl - MS 15. Yüzyıl Felsefesi", "Hristiyan Felsefesi ve İslam Felsefesi, Çeviri Faaliyetleri", "Orta Çağ felsefesi ve inanç-akıl ilişkisi", "0-1"],
        ["15. Yüzyıl - 17. Yüzyıl Felsefesi", "Rönesans Felsefesi, Modern Düşüncenin Doğuşu", "Avrupa'da yeniden doğuş ve bilimsel devrim", "0-1"],
        ["18. Yüzyıl - 19. Yüzyıl Felsefesi", "Aydınlanma Felsefesi, Kant ve Hegel", "Akıl ve aydınlanma dönemi düşünürleri", "0-1"],
        ["20. Yüzyıl Felsefesi", "Çağdaş Felsefe Akımları, Fenomenoloji, Varoluşçuluk vb.", "Günümüz felsefi akımları ve problemleri", "0-1"],
      ]),
    ],
  },
  {
    id: "din",
    name: "Din Kültürü ve Ahlak Bilgisi",
    short: "Din Kültürü",
    sections: [
      section("tyt-din", "Din Kültürü ve Ahlak Bilgisi", "TYT", [
        ["Bilgi ve İnanç", "İslam'da Bilgi Kaynakları (Vahiy, Akıl, Duyu), İnanç ve İslam İlişkisi, İmanın Mahiyeti", "İslam'a göre doğru bilginin kaynakları ve inancın temelleri", "1"],
        ["İslam ve İbadet", "İbadetin Amacı ve Önemi, Temel İbadetler (Namaz, Oruç, Zekat, Hac), İbadetlerin Bireysel ve Toplumsal Faydaları", "İslam'daki temel ibadetlerin yapılış amacı ve hayata etkileri", "1"],
        ["Allah ve İnsan İlişkisi", "Allah'ın Sıfatları, İnsanın Evrendeki Konumu, Dua, Tövbe, Kur'an'da İnsan Modeli", "Yaratıcı ile kul arasındaki bağın ibadet ve dua yoluyla incelenmesi", "1"],
        ["Hz. Muhammed (S.A.V.) ve Örnekliği", "Hz. Muhammed'in Kişiliği, Doğruluğu, Güvenilirliği, Merhameti, İstişareye Verdiği Önem, Bir İnsan Olarak Hz. Muhammed", "Peygamberin ahlaki vasıfları ve günlük hayattaki tutumu", "1"],
        ["Ahlak, Gençlik ve Değerler", "İslam Ahlakının Konusu, Temel Değerler (Adalet, Hikmet, İffet, Şecaat), Gençlerin Karakter Gelişimi", "İslami erdemler ve ahlaki kuralların toplumsal yaşama yansıması", "0-1"],
        ["Kur'an'da Bazı Kavramlar ve İslam Düşüncesi", "Kur'an'da Geçen Temel Kavramlar (Hidayet, İhsan, İhlas, Takva vb.), İslam Düşüncesinde Yorum Farklılıkları (Mezhepler)", "Kur'an'ın temel mesajları, tasavvufi ve fıkhi yorum ayrılıkları", "0-1"],
        ["Din, Kültür ve Sanat / Dünya Dinleri", "İslam Medeniyeti, Din ve Sanat İlişkisi, Temel Dünya Dinleri (Yahudilik, Hristiyanlık, Hinduizm vb.)", "İslam'ın kültüre, mimariye katkısı ve diğer inanç sistemleri", "0-1"],
      ]),
    ],
  },
];

export const ALL_TOPICS: Topic[] = COURSES.flatMap((c) => c.sections.flatMap((s) => s.topics));

export function courseTopicIds(course: Course): string[] {
  return course.sections.flatMap((s) => s.topics.map((t) => t.id));
}

export type TopicStatus = "not_started" | "in_progress" | "done" | "reviewed";

export const STATUS_LABELS: Record<TopicStatus, string> = {
  not_started: "Başlanmadı",
  in_progress: "Çalışılıyor",
  done: "Bitti",
  reviewed: "Tekrar edildi",
};

export const STATUS_ORDER: TopicStatus[] = ["not_started", "in_progress", "done", "reviewed"];

export function isCompleted(s: TopicStatus | undefined): boolean {
  return s === "done" || s === "reviewed";
}

// Konu kazanımları: her konuda öğrencinin sınavda yapabilmesi beklenenler (YKS kapsamı).
// Konu kimlikleri curriculum.ts ile aynıdır. Kazanım eklemek / düzenlemek için bu dosyayı değiştirmeniz yeterli.

export const KAZANIMLAR: Record<string, string[]> = {
  /* ---------------- TYT Türkçe ---------------- */
  "tyt-turkce.sozcukte-anlam": [
    "Sözcüğün gerçek, yan, mecaz ve terim anlamlarını ayırt eder.",
    "Eş, zıt ve sesteş sözcükleri bağlam içinde belirler.",
    "Deyim, atasözü ve söz öbeklerinin cümleye kattığı anlamı açıklar.",
    "Somut-soyut, genel-özel gibi anlam ilişkilerini yorumlar.",
  ],
  "tyt-turkce.cumlede-anlam": [
    "Öznel ve nesnel yargıyı ayırt eder.",
    "Tanım, varsayım, koşul, karşılaştırma gibi cümle kavramlarını belirler.",
    "Neden-sonuç, amaç-sonuç ve koşul-sonuç ilişkilerini bulur.",
    "Cümlenin dolaylı anlatımını ve örtük anlamını yorumlar.",
  ],
  "tyt-turkce.paragrafta-yapi": [
    "Paragrafı anlam bütünlüğüne göre doğru yerden ikiye böler.",
    "Düşüncenin akışını bozan cümleyi bulur.",
    "Paragrafa uygun giriş, gelişme ve sonuç cümlesi seçer.",
    "Cümlelerin yerini değiştirerek anlamlı bir sıralama kurar.",
  ],
  "tyt-turkce.paragrafta-anlam": [
    "Paragrafın ana düşüncesini ve konusunu belirler.",
    "Yardımcı düşünceleri ve paragrafta değinilmeyen yargıyı bulur.",
    "Paragrafa uygun başlık seçer.",
    "Anlatım biçimlerini ve düşünceyi geliştirme yollarını (tanımlama, örnekleme, karşılaştırma, tanık gösterme) ayırt eder.",
  ],
  "tyt-turkce.ses-bilgisi": [
    "Ünlü düşmesi, türemesi ve daralmasını örneklerde belirler.",
    "Ünsüz yumuşaması, benzeşmesi, düşmesi ve türemesini ayırt eder.",
    "Ulamayı ve okunuşa etkisini tanır.",
  ],
  "tyt-turkce.yazim-kurallari": [
    "Büyük harflerin kullanıldığı yerleri doğru uygular.",
    "Bağlaç ve ek olan de/da, ki, mi'nin yazımını ayırt eder.",
    "Birleşik sözcüklerin bitişik ya da ayrı yazımını belirler.",
    "Sayıların, kısaltmaların ve tarihlerin yazımındaki yanlışları bulur.",
  ],
  "tyt-turkce.noktalama-isaretleri": [
    "Nokta, virgül ve noktalı virgülün kullanım yerlerini belirler.",
    "İki nokta, üç nokta, soru ve ünlem işaretini doğru yerde kullanır.",
    "Kesme işareti, tırnak ve yay ayraç kullanımındaki yanlışları bulur.",
  ],
  "tyt-turkce.sozcukte-yapi": [
    "İsim ve fiil köklerini ayırt eder.",
    "Yapım ve çekim eklerini tanır, gövdeyi belirler.",
    "Sözcükleri yapı bakımından basit, türemiş ve birleşik olarak sınıflandırır.",
  ],
  "tyt-turkce.sozcuk-turleri": [
    "İsim, zamir, sıfat ve zarfı cümledeki görevine göre ayırt eder.",
    "Edat, bağlaç ve ünlemleri tanır ve cümleye kattığı anlamı açıklar.",
    "Fiillerin kip ve kişi eklerini, ek fiilin görevlerini belirler.",
    "Aynı sözcüğün farklı cümlelerde farklı türde kullanıldığını fark eder.",
  ],
  "tyt-turkce.fiilimsiler-fiilde-cati": [
    "İsim-fiil, sıfat-fiil ve zarf-fiil eklerini tanır.",
    "Fiilimsilerin cümledeki görevini belirler.",
    "Fiilleri öznesine göre etken-edilgen, dönüşlü, işteş olarak ayırt eder.",
    "Fiilleri nesnesine göre geçişli-geçişsiz ve ettirgen olarak sınıflandırır.",
  ],
  "tyt-turkce.cumlenin-ogeleri": [
    "Yüklemi ve özneyi bulur.",
    "Nesne, yer tamlayıcısı ve zarf tümlecini ayırt eder.",
    "Cümlede vurgulanan ögeyi ve ara sözü belirler.",
  ],
  "tyt-turkce.anlatim-bozukluklari": [
    "Gereksiz sözcük, anlamca çelişen ifade ve yanlış sözcük seçiminden kaynaklanan bozuklukları bulur.",
    "Özne-yüklem uyumsuzluğu, öge eksikliği ve ek yanlışlığından kaynaklanan bozuklukları belirler.",
    "Anlatım bozukluğu olan cümleyi düzeltir.",
  ],

  /* ---------------- AYT Edebiyat ---------------- */
  "ayt-edebiyat.siir-bilgisi": [
    "Nazım birimi, ölçü, kafiye ve rediften oluşan ahenk unsurlarını belirler.",
    "Nazım biçimlerini ve türlerini (lirik, epik, didaktik, pastoral, satirik, dramatik) ayırt eder.",
    "Teşbih, istiare, mecaz-ı mürsel, kinaye, tezat gibi söz sanatlarını örneklerde bulur.",
  ],
  "ayt-edebiyat.islamiyet-oncesi-ve-gecis-donemi-turk-edebiyati": [
    "Destan, sav, sagu ve koşuk türlerinin özelliklerini açıklar.",
    "Kutadgu Bilig, Divanü Lügati't-Türk, Atabetü'l-Hakayık ve Divan-ı Hikmet'in yazarını ve özelliklerini eşleştirir.",
    "İslamiyet öncesinden geçiş dönemine dil, ölçü ve konu değişimini açıklar.",
  ],
  "ayt-edebiyat.halk-edebiyati": [
    "Anonim, âşık tarzı ve dini-tasavvufi halk edebiyatının özelliklerini ayırt eder.",
    "Mani, türkü, koşma, semai, varsağı, destan ve ilahi gibi türleri tanır.",
    "Karacaoğlan, Pir Sultan Abdal, Yunus Emre gibi temsilcileri eserleri ve özellikleriyle eşleştirir.",
  ],
  "ayt-edebiyat.divan-edebiyati": [
    "Gazel, kaside, mesnevi, rubai gibi nazım biçimlerinin özelliklerini açıklar.",
    "Sebk-i Hindi, mahallileşme ve hikemî şiir akımlarını ayırt eder.",
    "Divan nesrinin türlerini ve özelliklerini tanır.",
    "Fuzuli, Baki, Nedim, Şeyh Galip gibi temsilcileri eserleriyle eşleştirir.",
  ],
  "ayt-edebiyat.tanzimat-edebiyati": [
    "Tanzimat edebiyatının birinci ve ikinci dönem özelliklerini karşılaştırır.",
    "Roman, tiyatro ve gazeteciliğin edebiyatımıza girişini açıklar.",
    "Şinasi, Namık Kemal, Ziya Paşa, Recaizade Mahmut Ekrem gibi temsilcileri eserleriyle eşleştirir.",
  ],
  "ayt-edebiyat.servetifunun-ve-fecriati-edebiyati": [
    "Servetifünun (Edebiyat-ı Cedide) şiirinin ve romanının özelliklerini açıklar.",
    "Tevfik Fikret, Halit Ziya, Cenap Şahabettin gibi temsilcileri eserleriyle eşleştirir.",
    "Fecriati Beyannamesi'ni ve Ahmet Haşim'in şiir anlayışını açıklar.",
  ],
  "ayt-edebiyat.milli-edebiyat": [
    "Genç Kalemler dergisini ve Yeni Lisan hareketinin dil anlayışını açıklar.",
    "Milli edebiyat döneminde şiir, roman ve hikâyenin özelliklerini belirler.",
    "Ömer Seyfettin, Ziya Gökalp, Mehmet Emin Yurdakul gibi temsilcileri eserleriyle eşleştirir.",
  ],
  "ayt-edebiyat.cumhuriyet-donemi-turk-edebiyati-siir": [
    "Saf şiir, Yedi Meşaleciler ve toplumcu şiir anlayışlarını ayırt eder.",
    "Garip (I. Yeni) ve İkinci Yeni akımlarının özelliklerini karşılaştırır.",
    "Milli edebiyat zevkini sürdüren şairleri ve özelliklerini tanır.",
    "Dönemin önemli şairlerini eserleri ve bağlı oldukları akımla eşleştirir.",
  ],
  "ayt-edebiyat.cumhuriyet-donemi-turk-edebiyati-roman-ve-hikaye": [
    "Milli ve dini duyarlılıkları yansıtan roman ve hikâyenin özelliklerini açıklar.",
    "Toplumcu gerçekçi roman ve köy romanının özelliklerini belirler.",
    "Bireyin iç dünyasını ve modernizmi esas alan yazarları ayırt eder.",
    "Dönemin önemli yazarlarını eserleriyle eşleştirir.",
  ],
  "ayt-edebiyat.cumhuriyet-donemi-tiyatro-ve-ogretici-metinler": [
    "Cumhuriyet dönemi tiyatrosunun gelişimini ve temsilcilerini tanır.",
    "Deneme, makale, fıkra, gezi yazısı ve hatıra türlerini ayırt eder.",
    "Öğretici metin türlerinin önemli temsilcilerini eserleriyle eşleştirir.",
  ],
  "ayt-edebiyat.edebi-akimlar": [
    "Klasisizm, romantizm, realizm ve natüralizmin temel özelliklerini açıklar.",
    "Parnasizm, sembolizm ve sürrealizmi karşılaştırır.",
    "Akımların Türk edebiyatındaki etkilerini ve temsilcilerini ilişkilendirir.",
  ],

  /* ---------------- TYT Felsefe ---------------- */
  "tyt-felsefe.felsefeyi-tanima": [
    "Felsefenin anlamını ve konusunu açıklar.",
    "Felsefi düşüncenin eleştirel, sorgulayıcı, refleksif ve tutarlı olma özelliklerini belirler.",
    "Felsefeyi bilim, din ve sanattan ayırt eder.",
  ],
  "tyt-felsefe.felsefe-ile-dusunme": [
    "Tümdengelim, tümevarım ve analoji akıl yürütmelerini ayırt eder.",
    "Bir argümanın öncül ve sonucunu belirler, geçerliliğini değerlendirir.",
    "Felsefi kavramları ve düşünme ile akıl yürütme ilişkisini açıklar.",
  ],
  "tyt-felsefe.felsefenin-temel-konulari": [
    "Varlık ve bilgi felsefesinin temel sorularını ve görüşlerini açıklar.",
    "Bilim, ahlak ve din felsefesinin sorularını ayırt eder.",
    "Siyaset ve sanat felsefesinin temel problemlerini ve filozofların görüşlerini eşleştirir.",
  ],
  "tyt-felsefe.mo-6-yuzyil-ms-2-yuzyil-felsefesi": [
    "Doğa filozoflarının arkhe anlayışlarını karşılaştırır.",
    "Sofistler ve Sokrates'in bilgi ve ahlak görüşlerini açıklar.",
    "Platon ve Aristoteles'in temel görüşlerini ayırt eder.",
  ],
  "tyt-felsefe.ms-2-yuzyil-ms-15-yuzyil-felsefesi": [
    "Hristiyan felsefesinin temel problemlerini ve temsilcilerini açıklar.",
    "İslam felsefesinin temel problemlerini ve Farabi, İbn Sina gibi filozofların görüşlerini belirler.",
    "Çeviri faaliyetlerinin felsefeye katkısını açıklar.",
  ],
  "tyt-felsefe.15-yuzyil-17-yuzyil-felsefesi": [
    "Rönesans'ın felsefeye etkisini açıklar.",
    "Descartes, Bacon gibi filozofların bilgi ve yöntem anlayışlarını karşılaştırır.",
    "Modern düşüncenin doğuşunu hazırlayan gelişmeleri belirler.",
  ],
  "tyt-felsefe.18-yuzyil-19-yuzyil-felsefesi": [
    "Aydınlanma felsefesinin temel düşüncelerini açıklar.",
    "Kant'ın bilgi ve ahlak felsefesini açıklar.",
    "Hegel'in diyalektik anlayışını ve dönemin diğer akımlarını belirler.",
  ],
  "tyt-felsefe.20-yuzyil-felsefesi": [
    "Fenomenoloji, varoluşçuluk ve pragmatizmin temel görüşlerini açıklar.",
    "Analitik felsefe ve diğer çağdaş akımları ayırt eder.",
    "Çağdaş filozofları görüşleriyle eşleştirir.",
  ],

  /* ---------------- Din Kültürü ---------------- */
  "tyt-din.bilgi-ve-inanc": [
    "İslam'da bilginin kaynaklarını (vahiy, akıl, duyular) açıklar.",
    "İman ile bilgi arasındaki ilişkiyi değerlendirir.",
    "İmanın mahiyetini ve temel inanç esaslarını açıklar.",
  ],
  "tyt-din.islam-ve-ibadet": [
    "İbadetin anlamını, amacını ve önemini açıklar.",
    "Namaz, oruç, zekât ve hac ibadetlerinin temel özelliklerini belirler.",
    "İbadetlerin bireysel ve toplumsal faydalarını yorumlar.",
  ],
  "tyt-din.allah-ve-insan-iliskisi": [
    "Allah'ın sıfatlarını ve insanla ilişkisini açıklar.",
    "Kur'an'a göre insanın evrendeki konumunu belirler.",
    "Dua ve tövbenin anlamını ve insana etkisini açıklar.",
  ],
  "tyt-din.hz-muhammed-s-a-v-ve-ornekligi": [
    "Hz. Muhammed'in doğruluk, güvenilirlik ve merhamet gibi özelliklerini örneklerle açıklar.",
    "İstişareye verdiği önemi örnek olaylarla değerlendirir.",
    "Bir insan ve peygamber olarak Hz. Muhammed'in örnekliğini açıklar.",
  ],
  "tyt-din.ahlak-genclik-ve-degerler": [
    "İslam ahlakının konusunu ve temel ilkelerini açıklar.",
    "Adalet, hikmet, iffet ve şecaat erdemlerini örneklerle açıklar.",
    "Gençlerin karakter gelişiminde değerlerin rolünü yorumlar.",
  ],
  "tyt-din.kur-an-da-bazi-kavramlar-ve-islam-dusuncesi": [
    "Hidayet, ihsan, ihlas, takva gibi Kur'an kavramlarını açıklar.",
    "İslam düşüncesindeki yorum farklılıklarının nedenlerini belirler.",
    "İtikadi ve fıkhi mezhepleri ayırt eder.",
  ],
  "tyt-din.din-kultur-ve-sanat-dunya-dinleri": [
    "İslam medeniyetinin bilim, kültür ve sanata katkılarını açıklar.",
    "Din ile sanat arasındaki ilişkiyi örneklerle yorumlar.",
    "Yahudilik, Hristiyanlık, Hinduizm ve Budizm'in temel özelliklerini karşılaştırır.",
  ],

  /* ---------------- TYT Matematik ---------------- */
  "tyt-matematik.temel-kavramlar-sayi-basamaklari-1": [
    "Rakam, doğal sayı, tam sayı ve gerçek sayı kavramlarını ayırt eder.",
    "Tek-çift ve pozitif-negatif sayıların işlem özelliklerini kullanır.",
    "Ardışık sayıların toplamını ve terim sayısını hesaplar.",
    "Sayı basamaklarını ve çözümlemeyi problemlerde kullanır.",
  ],
  "tyt-matematik.bolme-ve-bolunebilme": [
    "Bölme işleminde bölen, bölüm ve kalan ilişkisini kullanır.",
    "2, 3, 4, 5, 8, 9, 10 ve 11 ile bölünebilme kurallarını uygular.",
    "Asal sayıları ve aralarında asal sayıları belirler, asal çarpanlara ayırır.",
    "Bir sayının pozitif bölen sayısını hesaplar.",
  ],
  "tyt-matematik.ebob-ekok": [
    "İki veya daha fazla sayının EBOB ve EKOK'unu bulur.",
    "EBOB ile EKOK arasındaki ilişkiyi kullanır.",
    "Periyodik durum, karo döşeme ve parselleme problemlerini çözer.",
  ],
  "tyt-matematik.rasyonel-sayilar": [
    "Rasyonel sayılarla dört işlem yapar.",
    "Rasyonel sayıları sıralar ve sayı doğrusunda gösterir.",
    "Ondalık ve devirli ondalık sayıları rasyonel sayıya çevirir.",
  ],
  "tyt-matematik.basit-esitsizlikler": [
    "Eşitsizliğin özelliklerini işlemlerde uygular.",
    "Aralık kavramını kullanır ve çözüm kümesini sayı doğrusunda gösterir.",
    "Değişkenlerin aldığı en büyük ve en küçük değerleri bulur.",
  ],
  "tyt-matematik.mutlak-deger": [
    "Mutlak değerin tanımını ve özelliklerini uygular.",
    "Mutlak değerli denklemleri çözer.",
    "Mutlak değerli eşitsizliklerin çözüm kümesini bulur.",
  ],
  "tyt-matematik.uslu-ifadeler": [
    "Üslü sayıların özelliklerini kullanarak işlem yapar.",
    "Üslü denklemleri çözer.",
    "Üslü sayıları sıralar ve karşılaştırır.",
  ],
  "tyt-matematik.koklu-ifadeler": [
    "Köklü ifadeleri sadeleştirir ve kök dışına çıkarır.",
    "Köklü ifadelerle dört işlem yapar, paydayı eşlenikle rasyonel yapar.",
    "Köklü denklemleri çözer ve köklü sayıları sıralar.",
  ],
  "tyt-matematik.carpanlara-ayirma": [
    "Ortak çarpan parantezine alma ve gruplandırma ile çarpanlara ayırır.",
    "İki kare farkı, tam kare ve küp özdeşliklerini uygular.",
    "Rasyonel ifadeleri çarpanlara ayırarak sadeleştirir.",
  ],
  "tyt-matematik.denklem-cozme": [
    "Birinci dereceden bir bilinmeyenli denklemleri çözer.",
    "İki bilinmeyenli denklem sistemlerini yok etme ve yerine koyma yöntemleriyle çözer.",
    "Sözel ifadeleri denkleme dönüştürür.",
  ],
  "tyt-matematik.oran-oranti": [
    "Doğru, ters ve bileşik orantıyı problemlerde kullanır.",
    "Aritmetik, geometrik ve harmonik ortalamayı hesaplar.",
    "Oran-orantı özelliklerini kullanarak bilinmeyenleri bulur.",
  ],
  "tyt-matematik.problemler": [
    "Sayı, kesir ve yaş problemlerini denklem kurarak çözer.",
    "İşçi-havuz ve hareket (hız) problemlerini çözer.",
    "Yüzde, kâr-zarar ve faiz problemlerini çözer.",
    "Karışım ve rutin olmayan problemleri çözer, grafik ve tablo verisini yorumlar.",
  ],
  "tyt-matematik.kumeler": [
    "Küme, eleman ve alt küme kavramlarını kullanır; alt küme sayısını hesaplar.",
    "Birleşim, kesişim, fark ve tümleme işlemlerini yapar.",
    "Venn şeması ile küme problemlerini çözer.",
    "Kartezyen çarpımı bulur ve eleman sayısını hesaplar.",
  ],
  "tyt-matematik.mantik": [
    "Önermeyi ve değilini belirler, doğruluk değerini bulur.",
    "Ve, veya, ise, ancak ve ancak bağlaçlarıyla bileşik önermelerin doğruluğunu belirler.",
    "Totoloji ve çelişkiyi ayırt eder; her ve bazı niceleyicilerini kullanır.",
  ],
  "tyt-matematik.fonksiyonlar": [
    "Bağıntının fonksiyon olma şartını belirler, verilen değerde fonksiyonun değerini bulur.",
    "Birebir, örten, sabit, birim ve doğrusal fonksiyonları ayırt eder.",
    "Bileşke ve ters fonksiyonu bulur.",
    "Fonksiyon grafiğini okuyarak yorum yapar.",
  ],
  "tyt-matematik.veri-ve-istatistik": [
    "Veri setinin aritmetik ortalamasını, medyanını ve modunu bulur.",
    "Açıklık, çeyrekler açıklığı ve standart sapmayı yorumlar.",
    "Sütun, daire ve çizgi grafiklerinden veri okur ve yorumlar.",
  ],
  "tyt-matematik.permutasyon-kombinasyon": [
    "Toplama ve çarpma yoluyla sayma kurallarını uygular.",
    "Faktöriyel ile işlem yapar.",
    "Sıralama (permütasyon) ve tekrarlı permütasyon problemlerini çözer.",
    "Seçme (kombinasyon) problemlerini çözer, Pascal üçgenini ve binom açılımını kullanır.",
  ],
  "tyt-matematik.olasilik": [
    "Örnek uzay ve olayı belirler, basit olayların olasılığını hesaplar.",
    "Koşullu olasılığı hesaplar.",
    "Bağımsız ve ayrık olayların olasılığını bulur.",
  ],

  /* ---------------- AYT Matematik ---------------- */
  "ayt-matematik.polinomlar": [
    "Polinomun derecesini, katsayılarını ve sabit terimini belirler.",
    "Polinomlarla dört işlem yapar.",
    "Polinom bölmesinde kalanı bulur, kalan teoremini uygular.",
  ],
  "ayt-matematik.2-dereceden-denklemler": [
    "İkinci dereceden denklemleri çarpanlara ayırarak ve diskriminantla çözer.",
    "Diskriminanta göre köklerin durumunu belirler.",
    "Kökler ile katsayılar arasındaki ilişkileri kullanır.",
    "Karmaşık sayılarla işlem yapar.",
  ],
  "ayt-matematik.esitsizlikler": [
    "İkinci dereceden eşitsizlikleri tablo yöntemiyle çözer.",
    "Çarpım ve bölüm biçimindeki eşitsizliklerin çözüm kümesini bulur.",
    "Eşitsizlik sistemlerinin ortak çözümünü belirler.",
  ],
  "ayt-matematik.parabol": [
    "İkinci dereceden fonksiyonun grafiğini çizer.",
    "Tepe noktasını ve simetri eksenini bulur.",
    "Parabol ile doğrunun durumlarını inceler, en büyük-en küçük değer problemlerini çözer.",
  ],
  "ayt-matematik.logaritma": [
    "Üstel fonksiyonu ve logaritma fonksiyonunu tanır, birbirinin tersi olduğunu açıklar.",
    "Logaritmanın özelliklerini kullanarak işlem yapar.",
    "Logaritmalı denklem ve eşitsizlikleri çözer.",
  ],
  "ayt-matematik.diziler": [
    "Dizinin genel terimini kullanarak terimleri bulur.",
    "Aritmetik dizilerde genel terimi ve ilk n terim toplamını hesaplar.",
    "Geometrik dizilerde genel terimi ve ilk n terim toplamını hesaplar.",
    "Toplam sembolünün özelliklerini kullanır.",
  ],
  "ayt-matematik.trigonometri": [
    "Birim çemberi kullanarak trigonometrik değerleri bulur.",
    "Trigonometrik fonksiyonların grafiklerini ve periyotlarını yorumlar.",
    "Toplam-fark ve yarım açı formüllerini uygular.",
    "Trigonometrik denklemleri çözer.",
  ],
  "ayt-matematik.limit-ve-sureklilik": [
    "Bir noktada limiti, sağdan ve soldan limitle belirler.",
    "Limit özelliklerini kullanarak limit hesaplar.",
    "0/0 ve sonsuz/sonsuz belirsizliklerini giderir.",
    "Fonksiyonun bir noktada sürekliliğini inceler.",
  ],
  "ayt-matematik.turev": [
    "Türev alma kurallarını (toplam, çarpım, bölüm, zincir kuralı) uygular.",
    "Teğet ve normal doğru denklemini bulur.",
    "Türevle fonksiyonun artan-azalan olduğu aralıkları ve ekstremum noktalarını belirler.",
    "Maksimum-minimum problemlerini çözer.",
  ],
  "ayt-matematik.integral": [
    "Belirsiz integral kurallarını uygular.",
    "Değişken değiştirme yöntemiyle integral alır.",
    "Belirli integrali hesaplar ve özelliklerini kullanır.",
    "Eğri altında kalan alanı ve iki eğri arasındaki alanı hesaplar.",
  ],

  /* ---------------- Geometri ---------------- */
  "geometri.acilar-ve-ucgenler": [
    "Doğruda ve üçgende açı özelliklerini kullanır.",
    "Üçgende açı-kenar bağıntılarını ve üçgen eşitsizliğini uygular.",
    "Dik üçgen, Pisagor bağıntısı ve özel üçgenlerle uzunluk hesaplar.",
    "Üçgende eşlik, benzerlik, açıortay ve kenarortay özelliklerini kullanır.",
    "Üçgenin alanını farklı yöntemlerle hesaplar.",
  ],
  "geometri.cokgenler-ve-dortgenler": [
    "Çokgenlerin iç ve dış açı ölçülerini hesaplar.",
    "Düzgün çokgenlerin özelliklerini kullanır.",
    "Yamuk, paralelkenar, eşkenar dörtgen, dikdörtgen, kare ve deltoidin özelliklerini uygular.",
    "Dörtgenlerin alan ve çevresini hesaplar.",
  ],
  "geometri.cember-ve-daire": [
    "Çemberde merkez, çevre, teğet-kiriş ve iç açıları hesaplar.",
    "Kiriş, teğet ve kuvvet özelliklerini uygular.",
    "Çemberin çevresini, yay uzunluğunu, dairenin ve daire diliminin alanını hesaplar.",
  ],
  "geometri.kati-cisimler-uzay-geometri": [
    "Prizma ve piramitlerin alan ve hacmini hesaplar.",
    "Silindir, koni ve kürenin alan ve hacmini hesaplar.",
    "Cisimlerin açınımlarını ve kesitlerini yorumlar.",
  ],
  "geometri.analitik-geometri": [
    "İki nokta arası uzaklığı ve orta noktayı bulur.",
    "Doğrunun eğimini ve denklemini yazar.",
    "İki doğrunun paralellik, diklik ve kesişme durumlarını belirler; noktanın doğruya uzaklığını hesaplar.",
    "Öteleme, yansıma ve dönme dönüşümlerini uygular.",
  ],
  "geometri.cemberin-analitigi": [
    "Merkezi ve yarıçapı verilen çemberin denklemini yazar.",
    "Genel denklemi verilen çemberin merkezini ve yarıçapını bulur.",
    "Çember ile doğrunun ve iki çemberin birbirine göre durumunu belirler.",
  ],

  /* ---------------- TYT Fizik ---------------- */
  "tyt-fizik.fizik-bilimine-giris": [
    "Fiziğin alt dallarını ve diğer bilimlerle ilişkisini açıklar.",
    "Temel ve türetilmiş büyüklükleri ayırt eder.",
    "Skaler ve vektörel büyüklükleri sınıflandırır.",
  ],
  "tyt-fizik.madde-ve-ozellikleri": [
    "Kütle, hacim ve özkütle ilişkisini hesaplamalarda kullanır.",
    "Karışımların özkütlesini hesaplar.",
    "Dayanıklılığı boyutlarla ilişkilendirir.",
    "Adezyon, kohezyon, yüzey gerilimi ve kılcallığı günlük hayat örnekleriyle açıklar.",
  ],
  "tyt-fizik.hareket-ve-kuvvet-tyt": [
    "Konum, yol, yer değiştirme, sürat ve hız kavramlarını ayırt eder.",
    "Düzgün doğrusal hareketin konum-zaman ve hız-zaman grafiklerini yorumlar.",
    "Newton'ın hareket yasalarını açıklar.",
    "Sürtünme kuvvetinin harekete etkisini açıklar.",
  ],
  "tyt-fizik.is-enerji-ve-guc-tyt": [
    "Yapılan işi ve gücü hesaplar.",
    "Kinetik ve potansiyel enerjiyi hesaplar.",
    "Mekanik enerjinin korunumunu ve enerji dönüşümlerini açıklar.",
    "Verimi hesaplar.",
  ],
  "tyt-fizik.isi-sicaklik-ve-genlesme": [
    "Isı, sıcaklık ve iç enerji kavramlarını ayırt eder.",
    "Termometre ölçekleri arasında dönüşüm yapar.",
    "Öz ısı, ısı sığası ve hal değişimi ile ilgili hesaplamalar yapar.",
    "Isı alışverişinde denge sıcaklığını bulur; iletim yollarını ve genleşmeyi açıklar.",
  ],
  "tyt-fizik.elektrostatik": [
    "Elektrik yüklerini ve aralarındaki etkileşimi açıklar.",
    "Sürtünme, dokunma ve etki ile elektriklenmeyi açıklar.",
    "Elektroskobun çalışmasını ve topraklamayı yorumlar.",
    "Coulomb kanunu ile yükler arası kuvveti hesaplar.",
  ],
  "tyt-fizik.elektrik-ve-manyetizma-tyt": [
    "Akım, potansiyel fark ve direnç arasındaki ilişkiyi (Ohm yasası) kullanır.",
    "Seri ve paralel bağlı dirençlerde eşdeğer direnci, akımı ve gerilimi hesaplar.",
    "Elektrik enerjisini ve gücünü hesaplar.",
    "Mıknatısların manyetik alanını ve akımın manyetik etkisini açıklar.",
  ],
  "tyt-fizik.basinc-ve-kaldirma-kuvveti": [
    "Katı, sıvı ve gaz basıncını hesaplar.",
    "Açık hava basıncını ve ölçümünü açıklar.",
    "Arşimet ilkesine göre kaldırma kuvvetini hesaplar.",
    "Yüzme, askıda kalma ve batma durumlarını yorumlar.",
  ],
  "tyt-fizik.dalgalar-tyt": [
    "Dalga boyu, frekans, periyot ve hız ilişkisini kullanır.",
    "Yay ve su dalgalarında yansıma ve kırılmayı açıklar.",
    "Ses dalgalarının özelliklerini açıklar.",
    "Deprem dalgalarını tanır.",
  ],
  "tyt-fizik.optik": [
    "Aydınlanma şiddetini ve gölge oluşumunu açıklar.",
    "Düz ve küresel aynalarda görüntü özelliklerini belirler.",
    "Kırılma ve tam yansımayı açıklar.",
    "Mercekte görüntü oluşumunu ve renklerin oluşumunu açıklar.",
  ],

  /* ---------------- AYT Fizik ---------------- */
  "ayt-fizik.vektorler-bagil-hareket": [
    "Vektörlerin bileşkesini ve bileşenlerini bulur.",
    "Bağıl hızı hesaplar.",
    "Nehir problemlerinde karşıya geçiş süresini ve sürüklenmeyi hesaplar.",
  ],
  "ayt-fizik.newton-in-hareket-yasalari-dinamik": [
    "Newton'ın hareket yasalarını dinamik problemlerinde uygular.",
    "Eğik düzlemde ve sürtünmeli yüzeyde hareketi inceler.",
    "İpli ve üst üste konmuş cisim sistemlerinde ivme ve gerilme kuvvetini hesaplar.",
  ],
  "ayt-fizik.bir-ve-iki-boyutta-hareket-atislar": [
    "Sabit ivmeli hareketin denklemlerini ve grafiklerini kullanır.",
    "Serbest düşme ve düşey atış hareketlerini inceler.",
    "Yatay ve eğik atışta menzil, maksimum yükseklik ve uçuş süresini hesaplar.",
  ],
  "ayt-fizik.is-enerji-ve-cizgisel-momentum": [
    "İş-enerji teoremini uygular.",
    "İtme ve momentum değişimi ilişkisini kullanır.",
    "Momentumun korunumunu esnek ve esnek olmayan çarpışmalarda uygular.",
  ],
  "ayt-fizik.tork-denge-ve-kutle-merkezi": [
    "Kuvvetin döndürme etkisini (tork) hesaplar.",
    "Öteleme ve dönme dengesi şartlarını uygular, Lami teoremini kullanır.",
    "Kütle ve ağırlık merkezini bulur.",
  ],
  "ayt-fizik.basit-makineler": [
    "Kaldıraç, makara ve palangada kuvvet kazancını hesaplar.",
    "Eğik düzlem, çıkrık ve vidada kuvvet-yol ilişkisini açıklar.",
    "Dişli çark ve kasnaklarda dönme sayısı ve yön ilişkisini belirler.",
  ],
  "ayt-fizik.elektriksel-kuvvet-ve-potansiyel": [
    "Coulomb yasası ile yükler arası kuvveti hesaplar.",
    "Elektrik alan, elektriksel potansiyel ve potansiyel enerjiyi hesaplar.",
    "Paralel levhalar arasında yüklü parçacığın hareketini inceler.",
    "Sığaçların sığasını ve bağlanma durumlarını hesaplar.",
  ],
  "ayt-fizik.manyetizma-ve-elektromanyetik-indukleme": [
    "Akım geçen tel, halka ve akım makarasının manyetik alanını belirler.",
    "Manyetik alanda yüklü parçacığa ve akım geçen tele etkiyen kuvveti bulur.",
    "Manyetik akı değişimiyle oluşan indüksiyon akımını açıklar.",
    "Alternatif akımı ve transformatörlerin çalışmasını açıklar.",
  ],
  "ayt-fizik.duzgun-cembersel-hareket": [
    "Açısal hız, periyot, frekans ve merkezcil ivmeyi hesaplar.",
    "Merkezcil kuvvet gerektiren durumları inceler.",
    "Dönerek öteleme, eylemsizlik momenti ve açısal momentumu açıklar.",
  ],
  "ayt-fizik.kepler-kanunlari-harmonik-hareket": [
    "Kütle çekim kuvvetini hesaplar.",
    "Kepler yasalarını açıklar.",
    "Yay ve basit sarkaçta basit harmonik hareketin periyodunu hesaplar.",
  ],
  "ayt-fizik.dalga-mekanigi-ve-isik-teorileri": [
    "Kırınım ve girişim olaylarını açıklar.",
    "Young deneyinde saçak aralığını hesaplar.",
    "Doppler olayını açıklar.",
    "Elektromanyetik dalgaların özelliklerini ve spektrumunu açıklar.",
  ],
  "ayt-fizik.modern-fizik": [
    "Özel göreliliğin temel sonuçlarını açıklar.",
    "Fotoelektrik olayda eşik enerjisini ve kinetik enerjiyi hesaplar.",
    "Compton saçılmasını açıklar.",
    "Bohr atom modelinde enerji düzeyleri ve ışıma ilişkisini açıklar.",
  ],
  "ayt-fizik.modern-fizigin-teknolojideki-uygulamalari": [
    "Röntgen, MR, PET gibi görüntüleme teknolojilerinin çalışma ilkelerini açıklar.",
    "Yarı iletkenlerin ve süper iletkenlerin özelliklerini açıklar.",
    "Nanoteknoloji ve lazerin kullanım alanlarını açıklar.",
  ],

  /* ---------------- TYT Kimya ---------------- */
  "tyt-kimya.kimya-bilimi": [
    "Simyadan kimyaya geçiş sürecini açıklar.",
    "Kimyanın alt dallarını ve uğraş alanlarını belirler.",
    "Element ve bileşikleri sembol ve formülleriyle ayırt eder.",
    "Laboratuvar güvenlik işaretlerini tanır.",
  ],
  "tyt-kimya.atom-ve-periyodik-sistem": [
    "Atom modellerinin gelişimini açıklar.",
    "Proton, nötron ve elektron sayılarını belirler; izotop, izoton ve izobarı ayırt eder.",
    "Elementin periyodik sistemdeki yerini bulur.",
    "Periyodik özelliklerin değişimini yorumlar.",
  ],
  "tyt-kimya.kimyasal-turler-arasi-etkilesimler": [
    "Kimyasal türleri (atom, molekül, iyon) ayırt eder.",
    "İyonik, kovalent ve metalik bağı açıklar.",
    "Van der Waals etkileşimlerini ve hidrojen bağını açıklar.",
    "Fiziksel ve kimyasal değişimleri ayırt eder.",
  ],
  "tyt-kimya.maddenin-halleri": [
    "Katıların amorf ve kristal yapısını ayırt eder.",
    "Sıvılarda viskozite, buhar basıncı ve kaynama noktasını açıklar.",
    "Gazların genel özelliklerini açıklar.",
    "Plazmayı ve hal değişimlerini açıklar.",
  ],
  "tyt-kimya.kimyanin-temel-kanunlari-ve-kimyasal-hesaplamalar": [
    "Kütlenin korunumu, sabit oranlar ve katlı oranlar kanunlarını uygular.",
    "Mol kavramını kullanarak tanecik sayısı, kütle ve hacim hesaplar.",
    "Kimyasal tepkime türlerini ayırt eder, denklemleri denkleştirir.",
    "Sınırlayıcı bileşen ve verim hesaplamaları yapar.",
  ],
  "tyt-kimya.karisimlar-tyt": [
    "Homojen ve heterojen karışımları ayırt eder.",
    "Çözünme sürecini açıklar.",
    "Kütlece ve hacimce yüzde derişimi hesaplar.",
    "Karışımları ayırma yöntemlerini açıklar.",
  ],
  "tyt-kimya.asitler-bazlar-ve-tuzlar": [
    "Asit ve bazların genel özelliklerini açıklar.",
    "pH kavramını yorumlar.",
    "Nötrleşme tepkimelerini ve tuz oluşumunu açıklar.",
    "Günlük hayattaki asit ve bazları tanır.",
  ],
  "tyt-kimya.kimya-her-yerde": [
    "Temizlik maddelerinin özelliklerini ve güvenli kullanımını açıklar.",
    "Polimerlerin yapısını ve kullanım alanlarını açıklar.",
    "Kozmetik, ilaç ve gıda katkı maddelerinin özelliklerini açıklar.",
  ],

  /* ---------------- AYT Kimya ---------------- */
  "ayt-kimya.atomun-kuantum-modeli": [
    "Kuantum sayılarını ve orbitalleri açıklar.",
    "Atom ve iyonların elektron dizilimini yazar.",
    "Periyodik özellikleri bloklara göre inceler.",
    "Yükseltgenme basamaklarını belirler.",
  ],
  "ayt-kimya.gazlar": [
    "Gaz yasalarını kullanarak basınç, hacim, sıcaklık ve mol ilişkisini hesaplar.",
    "İdeal gaz denklemini uygular.",
    "Kinetik teori ile gaz davranışlarını ve difüzyonu açıklar.",
    "Gaz karışımlarında kısmi basıncı hesaplar, gerçek gazları ideal gazlardan ayırt eder.",
  ],
  "ayt-kimya.sivi-cozeltiler-ve-cozunurluk": [
    "Molarite, molalite ve ppm derişimlerini hesaplar.",
    "Koligatif özellikleri (kaynama noktası yükselmesi, donma noktası alçalması) açıklar.",
    "Çözünürlüğü etkileyen faktörleri yorumlar.",
  ],
  "ayt-kimya.kimyasal-tepkimelerde-enerji": [
    "Ekzotermik ve endotermik tepkimeleri ayırt eder.",
    "Tepkime entalpisini oluşum entalpilerinden hesaplar.",
    "Hess yasasını uygular.",
    "Bağ enerjilerini kullanarak entalpi değişimini hesaplar.",
  ],
  "ayt-kimya.kimyasal-tepkimelerde-hiz": [
    "Tepkime hızını tanımlar ve hız ifadesini yazar.",
    "Çarpışma teorisi ve aktifleşme enerjisini açıklar.",
    "Derişim, sıcaklık ve katalizörün hıza etkisini yorumlar.",
  ],
  "ayt-kimya.kimyasal-tepkimelerde-denge": [
    "Dengeyi minimum enerji ve maksimum düzensizlik eğilimleriyle açıklar.",
    "Kc ve Kp denge sabitlerini yazar ve hesaplar.",
    "Le Chatelier ilkesine göre dengeye etki eden faktörleri yorumlar.",
  ],
  "ayt-kimya.asit-baz-dengesi-sulu-cozeltilerde-denge": [
    "Brönsted-Lowry asit-baz tanımını ve eşlenik çiftleri açıklar.",
    "Suyun otoiyonizasyonu ile pH ve pOH hesaplar.",
    "Zayıf asit ve bazlarda Ka ve Kb ile hesaplama yapar.",
    "Tampon çözeltileri ve titrasyon eğrilerini yorumlar.",
  ],
  "ayt-kimya.cozunme-cokelme-dengeleri-kcc": [
    "Çözünürlük çarpımı (Kçç) ifadesini yazar ve çözünürlüğü hesaplar.",
    "Çökelme olup olmayacağını belirler.",
    "Ortak iyon etkisini açıklar.",
  ],
  "ayt-kimya.kimya-ve-elektrik-elektrokimya": [
    "Redoks tepkimelerinde yükseltgenen ve indirgenen türleri belirler.",
    "Metallerin aktifliğini karşılaştırır.",
    "Galvanik pillerde pil potansiyelini hesaplar, Nernst eşitliğini yorumlar.",
    "Elektroliz ve korozyonu açıklar.",
  ],
  "ayt-kimya.karbon-kimyasina-giris": [
    "Organik ve anorganik bileşikleri ayırt eder.",
    "Karbonun allotroplarını açıklar.",
    "Lewis formüllerini yazar.",
    "Hibritleşme türlerini ve molekül geometrilerini belirler.",
  ],
  "ayt-kimya.organik-bilesikler": [
    "Alkan, alken ve alkinleri adlandırır, özelliklerini açıklar.",
    "Aromatik bileşiklerin yapısını tanır.",
    "Fonksiyonel grupları belirler.",
    "Alkol, eter ve karbonil bileşiklerinin özelliklerini ve tepkimelerini açıklar.",
  ],
  "ayt-kimya.enerji-kaynaklari-ve-bilimsel-gelismeler": [
    "Fosil yakıtların özelliklerini ve çevresel etkilerini açıklar.",
    "Alternatif enerji kaynaklarını karşılaştırır.",
    "Sürdürülebilirlik ve nanoteknolojinin kimyadaki önemini açıklar.",
  ],

  /* ---------------- TYT Biyoloji ---------------- */
  "tyt-biyoloji.canlilarin-ortak-ozellikleri": [
    "Canlıların ortak özelliklerini açıklar.",
    "Beslenme, solunum ve boşaltımın canlılıktaki önemini açıklar.",
    "Hücresel organizasyon düzeylerini sıralar.",
  ],
  "tyt-biyoloji.canlilarin-temel-bilesenleri": [
    "Su, mineral, asit, baz ve tuzların canlılar için önemini açıklar.",
    "Karbonhidrat, lipit ve proteinlerin yapısını ve görevlerini açıklar.",
    "Enzimlerin çalışmasını ve etki eden faktörleri yorumlar.",
    "Vitaminleri, nükleik asitleri ve ATP'nin görevini açıklar.",
  ],
  "tyt-biyoloji.hucrenin-yapisi-ve-islevleri": [
    "Hücre teorisini açıklar.",
    "Hücre zarının yapısını ve madde geçiş yollarını (difüzyon, ozmoz, aktif taşıma, endositoz, ekzositoz) açıklar.",
    "Organellerin görevlerini açıklar.",
    "Çekirdeğin yapısını ve görevlerini açıklar.",
  ],
  "tyt-biyoloji.canlilarin-cesitliligi-ve-siniflandirilmasi": [
    "Sınıflandırmanın ilkelerini ve kategorilerini açıklar.",
    "Bakteri, arke, protista, mantar, bitki ve hayvan âlemlerinin özelliklerini karşılaştırır.",
    "Virüslerin özelliklerini açıklar.",
  ],
  "tyt-biyoloji.hucre-bolunmeleri-ve-ureme": [
    "Mitoz bölünmenin evrelerini ve önemini açıklar.",
    "Eşeysiz üreme çeşitlerini örneklerle açıklar.",
    "Mayoz bölünmenin evrelerini ve kalıtsal çeşitliliğe katkısını açıklar.",
    "Eşeyli üremeyi ve döllenmeyi açıklar.",
  ],
  "tyt-biyoloji.kalitimin-temel-ilkeleri-genetik": [
    "Mendel ilkelerini açıklar.",
    "Monohibrit ve dihibrit çaprazlamalarda olasılık hesaplar.",
    "Eş baskınlık, çok alellilik ve kan gruplarının kalıtımını açıklar.",
    "Eşeye bağlı kalıtımı ve soyağaçlarını yorumlar.",
  ],
  "tyt-biyoloji.ekosistem-ekolojisi-ve-guncel-cevre-sorunlari": [
    "Ekosistemin canlı ve cansız bileşenlerini açıklar.",
    "Besin zinciri ve piramidinde madde ve enerji akışını yorumlar.",
    "Karbon, azot ve su döngülerini açıklar.",
    "Sera etkisi, erozyon ve biyoçeşitlilik kaybı gibi çevre sorunlarını değerlendirir.",
  ],

  /* ---------------- AYT Biyoloji ---------------- */
  "ayt-biyoloji.sinir-sistemi": [
    "Nöronun yapısını ve çeşitlerini açıklar.",
    "İmpulsun oluşumunu ve iletimini açıklar, sinapsları tanır.",
    "Merkezi ve çevresel sinir sisteminin bölümlerini ve görevlerini açıklar.",
    "Sinir sistemi rahatsızlıklarını tanır.",
  ],
  "ayt-biyoloji.endokrin-sistem": [
    "Hormonların yapısını ve etki mekanizmasını açıklar.",
    "Hipofiz, tiroit, böbrek üstü ve pankreas gibi bezlerin hormonlarını ve görevlerini eşleştirir.",
    "Geri bildirim mekanizmasını açıklar.",
  ],
  "ayt-biyoloji.duyu-organlari": [
    "Göz ve kulağın yapısını, görme ve işitmenin nasıl gerçekleştiğini açıklar.",
    "Burun, dil ve derinin yapısını ve işleyişini açıklar.",
    "Duyu organı rahatsızlıklarını tanır.",
  ],
  "ayt-biyoloji.destek-ve-hareket-sistemi": [
    "Kemik ve kıkırdak dokularının yapısını açıklar.",
    "Eklem çeşitlerini açıklar.",
    "Kas çeşitlerini ve kayan iplikler modeline göre kasılma mekanizmasını açıklar.",
  ],
  "ayt-biyoloji.sindirim-sistemi": [
    "Sindirim organlarını ve yardımcı bezleri açıklar.",
    "Mekanik ve kimyasal sindirimi ve enzimlerin görevlerini açıklar.",
    "Besinlerin kan ve lenf yoluyla emilimini açıklar.",
  ],
  "ayt-biyoloji.dolasim-ve-bagisiklik-sistemi": [
    "Kalbin yapısını ve çalışmasını açıklar.",
    "Damarları, kanın yapısını ve lenf dolaşımını açıklar.",
    "Özgül ve özgül olmayan bağışıklığı ayırt eder.",
  ],
  "ayt-biyoloji.solunum-sistemi": [
    "Solunum organlarını ve soluk alıp verme mekanizmasını açıklar.",
    "Alveollerde ve dokularda gaz değişimini açıklar.",
    "Oksijen ve karbondioksit taşınmasını ve Bohr etkisini açıklar.",
  ],
  "ayt-biyoloji.uriner-sistem-bosaltim": [
    "Böbreğin ve nefronun yapısını açıklar.",
    "Süzülme, geri emilim ve salgılama ile idrar oluşumunu açıklar.",
    "Böbreklerin homeostazideki rolünü açıklar.",
  ],
  "ayt-biyoloji.ureme-sistemi-ve-embriyonik-gelisim": [
    "Dişi ve erkek üreme sistemlerinin yapısını açıklar.",
    "Menstrüel döngüyü ve hormonların rolünü açıklar.",
    "Döllenmeyi ve embriyonik gelişim evrelerini (segmentasyon, gastrulasyon) açıklar.",
  ],
  "ayt-biyoloji.populasyon-ve-komunite-ekolojisi": [
    "Popülasyon büyüme eğrilerini ve etkileyen faktörleri yorumlar.",
    "Komünitede rekabet ve av-avcı ilişkilerini açıklar.",
    "Simbiyotik ilişkileri (mutualizm, kommensalizm, parazitlik) ayırt eder.",
    "Süksesyonu açıklar.",
  ],
  "ayt-biyoloji.genden-proteine-molekuler-genetik": [
    "Nükleik asitlerin yapısını açıklar.",
    "DNA'nın kendini eşlemesini açıklar.",
    "Transkripsiyon ve translasyon ile protein sentezini açıklar.",
    "Genetik şifreyi yorumlar.",
  ],
  "ayt-biyoloji.biyoteknoloji-ve-gen-muhendisligi": [
    "Rekombinant DNA teknolojisini ve gen klonlamayı açıklar.",
    "PCR'ın amacını ve aşamalarını açıklar.",
    "Kök hücre ve model organizmaların kullanım alanlarını açıklar.",
    "Biyoteknoloji uygulamalarının etik boyutunu değerlendirir.",
  ],
  "ayt-biyoloji.canlilarda-enerji-donusumleri": [
    "Oksijenli solunumun evrelerini ve ATP üretimini açıklar.",
    "Oksijensiz solunumu ve etil alkol ile laktik asit fermantasyonunu karşılaştırır.",
    "Fotosentezin ışığa bağımlı ve ışıktan bağımsız evrelerini açıklar.",
    "Kemosentezi açıklar.",
  ],
  "ayt-biyoloji.bitki-biyolojisi": [
    "Bitki dokularını ve kök, gövde, yaprağın yapısını açıklar.",
    "Ksilem ve floemde madde taşınmasını açıklar.",
    "Bitki hormonlarının etkilerini açıklar.",
    "Bitkilerde eşeyli üremeyi ve çimlenmeyi açıklar.",
  ],

  /* ---------------- TYT Tarih ---------------- */
  "tyt-tarih.tarih-bilimine-giris": [
    "Tarihin konusunu ve yöntemini açıklar.",
    "Tarihi kaynakları sınıflandırır.",
    "Takvimleri ve zaman hesaplamalarını kullanır.",
  ],
  "tyt-tarih.ilk-cag-medeniyetleri": [
    "Tarih öncesi çağların özelliklerini açıklar.",
    "Mezopotamya ve Mısır uygarlıklarının özelliklerini karşılaştırır.",
    "Anadolu ve Ege uygarlıklarının kültürel katkılarını açıklar.",
  ],
  "tyt-tarih.islamiyet-oncesi-turk-tarihi": [
    "Orta Asya'nın Türk tarihindeki yerini açıklar.",
    "Asya Hun, Göktürk ve Uygur devletlerinin siyasi ve kültürel özelliklerini açıklar.",
    "İlk Türk devletlerinde devlet yönetimi, ordu ve ekonomiyi açıklar.",
  ],
  "tyt-tarih.islam-tarihi": [
    "İslamiyet'in doğuşunu ve Hz. Muhammed dönemini açıklar.",
    "Dört Halife dönemini açıklar.",
    "Emevi ve Abbasi dönemlerinin özelliklerini karşılaştırır.",
  ],
  "tyt-tarih.ilk-turk-islam-devletleri": [
    "Türklerin İslamiyet'i kabul sürecini açıklar.",
    "Karahanlı, Gazneli ve Büyük Selçuklu devletlerinin özelliklerini açıklar.",
    "Türk-İslam kültür ve medeniyetini açıklar.",
  ],
  "tyt-tarih.turkiye-selcuklu-devleti": [
    "Türklerin Anadolu'ya yerleşme sürecini açıklar.",
    "Türkiye Selçuklu Devleti'nin kuruluşunu ve gelişmesini açıklar.",
    "Haçlı Seferleri'nin nedenlerini ve sonuçlarını açıklar.",
  ],
  "tyt-tarih.osmanli-devleti-kurulus-ve-yukselme": [
    "Osmanlı Beyliği'nin devletleşme sürecini açıklar.",
    "İstanbul'un fethinin nedenlerini ve sonuçlarını açıklar.",
    "Osmanlı'nın dünya gücü hâline gelme sürecini açıklar.",
  ],
  "tyt-tarih.osmanli-devleti-duraklama-ve-gerileme": [
    "XVII. yüzyılda Osmanlı'nın siyasi ve askeri durumunu açıklar.",
    "Avrupa'daki gelişmelerin Osmanlı'ya etkilerini açıklar.",
    "Islahat girişimlerini ve sonuçlarını değerlendirir.",
  ],
  "tyt-tarih.osmanli-devleti-dagilma": [
    "Osmanlı'nın denge politikasını açıklar.",
    "Tanzimat ve Islahat fermanlarının içeriğini ve sonuçlarını açıklar.",
    "Toprak kayıplarının nedenlerini açıklar.",
  ],
  "tyt-tarih.milli-mucadele-hazirlik": [
    "XX. yüzyıl başında Osmanlı'nın durumunu açıklar.",
    "I. Dünya Savaşı'nda Osmanlı cephelerini ve Mondros Ateşkes Antlaşması'nı açıklar.",
    "Cemiyetleri ve kongrelerin kararlarını açıklar.",
  ],
  "tyt-tarih.milli-mucadele-ve-kurtulus-savasi": [
    "Doğu, güney ve batı cephelerindeki gelişmeleri açıklar.",
    "Mudanya Ateşkes Antlaşması'nın önemini açıklar.",
    "Lozan Barış Antlaşması'nın maddelerini ve önemini açıklar.",
  ],
  "tyt-tarih.ataturk-ilkeleri-ve-inkilaplari": [
    "Siyasi ve hukuki alandaki inkılapları açıklar.",
    "Eğitim, kültür ve ekonomi alanındaki inkılapları açıklar.",
    "Atatürk ilkelerini inkılaplarla ilişkilendirir.",
  ],

  /* ---------------- AYT Tarih ---------------- */
  "ayt-tarih.tarih-bilimine-giris": [
    "Tarihin konusunu, yöntemini ve yardımcı bilimlerini açıklar.",
    "Kaynakları sınıflandırır.",
    "Takvimleri ve yüzyıl hesaplamalarını kullanır.",
  ],
  "ayt-tarih.insanligin-ilk-donemleri-ve-uygarliklar": [
    "Tarih öncesi ve tarihi çağların özelliklerini açıklar.",
    "Mezopotamya, Mısır, Hint ve Çin uygarlıklarını karşılaştırır.",
    "Doğu Akdeniz, Anadolu ve Ege uygarlıklarının katkılarını açıklar.",
  ],
  "ayt-tarih.islamiyet-oncesi-turk-tarihi": [
    "Türk adının anlamını ve Orta Asya kültür merkezlerini açıklar.",
    "Asya Hun, Göktürk ve Uygur devletlerinin siyasi tarihini açıklar.",
    "Diğer Türk boylarını tanır.",
    "İlk Türk devletlerinde devlet yönetimi, ordu ve inanç sistemini açıklar.",
  ],
  "ayt-tarih.islam-tarihi-ve-uygarligi": [
    "İslamiyet öncesi Arabistan'ı ve Hz. Muhammed dönemini açıklar.",
    "Dört Halife, Emevi ve Abbasi dönemlerini açıklar.",
    "Mısır'da kurulan ilk Türk-İslam devletlerini tanır.",
    "İslam medeniyetinin bilim ve kültüre katkılarını açıklar.",
  ],
  "ayt-tarih.ilk-turk-islam-devletleri": [
    "Türklerin İslamiyet'i kabulünü açıklar.",
    "Karahanlı, Gazneli ve Büyük Selçukluların siyasi tarihini açıklar.",
    "Türk-İslam devletlerinde hukuk, toprak yönetimi, bilim ve sanatı açıklar.",
  ],
  "ayt-tarih.turkiye-selcuklu-devleti-ve-beylikler": [
    "Anadolu'ya Türk göçlerini ve Malazgirt sonrası ilk beylikleri açıklar.",
    "Türkiye Selçuklu Devleti'nin siyasi tarihini açıklar.",
    "Haçlı Seferleri'ni ve Kösedağ Savaşı'nın sonuçlarını açıklar.",
    "İkinci Beylikler dönemini açıklar.",
  ],
  "ayt-tarih.osmanli-devleti-siyasi-tarihi": [
    "Kuruluş döneminde Osmanlı'nın büyüme politikasını açıklar.",
    "Yükselme döneminin fetihlerini ve sonuçlarını açıklar.",
    "Duraklama ve gerileme döneminin antlaşmalarını açıklar.",
    "Dağılma döneminin denge politikasını açıklar.",
  ],
  "ayt-tarih.osmanli-kultur-ve-medeniyeti": [
    "Merkez ve taşra teşkilatını açıklar.",
    "Tımar sistemini ve ekonomik yapıyı açıklar.",
    "Ordu, eğitim ve hukuk sistemini açıklar.",
    "Osmanlı mimari ve sanatını açıklar.",
  ],
  "ayt-tarih.19-ve-20-yuzyilda-osmanli-islahatlar": [
    "Tanzimat ve Islahat fermanlarının içeriğini açıklar.",
    "I. ve II. Meşrutiyet'i karşılaştırır.",
    "Osmanlıcılık, Türkçülük, İslamcılık ve Batıcılık fikir akımlarını ayırt eder.",
  ],
  "ayt-tarih.xx-yuzyil-baslarinda-osmanli-ve-i-dunya-savasi": [
    "Trablusgarp ve Balkan savaşlarının nedenlerini ve sonuçlarını açıklar.",
    "I. Dünya Savaşı'nın nedenlerini ve Osmanlı cephelerini açıklar.",
    "Gizli antlaşmaları ve Mondros Ateşkes Antlaşması'nı açıklar.",
    "Yararlı ve zararlı cemiyetleri ayırt eder.",
  ],
  "ayt-tarih.milli-mucadele-hazirlik-donemi": [
    "İzmir'in işgalini ve Mustafa Kemal'in Samsun'a çıkışını açıklar.",
    "Amasya Genelgesi, Erzurum ve Sivas kongrelerinin kararlarını karşılaştırır.",
    "Misak-ı Milli'yi ve TBMM'nin açılışını açıklar.",
    "TBMM'ye karşı ayaklanmaları açıklar.",
  ],
  "ayt-tarih.milli-mucadele-muharebeler-ve-antlasmalar": [
    "Doğu ve güney cephelerindeki gelişmeleri ve antlaşmaları açıklar.",
    "Batı cephesindeki muharebeleri ve sonuçlarını açıklar.",
    "Mudanya Ateşkesi ve Lozan Barış Antlaşması'nı açıklar.",
  ],
  "ayt-tarih.ataturk-ilkeleri-ve-inkilaplari": [
    "Siyasi, hukuki, eğitim, toplumsal ve ekonomik inkılapları açıklar.",
    "Altı ilkenin anlamını açıklar.",
    "İlkeler ile inkılaplar arasındaki ilişkiyi kurar.",
  ],
  "ayt-tarih.ataturk-donemi-turk-dis-politikasi": [
    "Nüfus mübadelesi ve yabancı okullar sorununu açıklar.",
    "Musul sorununu açıklar.",
    "Montrö Boğazlar Sözleşmesi'ni ve Hatay'ın anavatana katılmasını açıklar.",
  ],

  /* ---------------- TYT Coğrafya ---------------- */
  "tyt-cografya.doga-ve-insan": [
    "Coğrafyanın konusunu ve bölümlerini açıklar.",
    "Doğa ile insan arasındaki etkileşimi örneklerle açıklar.",
  ],
  "tyt-cografya.dunya-nin-sekli-ve-hareketleri": [
    "Dünya'nın şeklinin sonuçlarını açıklar.",
    "Günlük hareketin sonuçlarını açıklar.",
    "Yıllık hareketin ve eksen eğikliğinin sonuçlarını açıklar.",
  ],
  "tyt-cografya.cografi-konum": [
    "Paralel ve meridyenlerin özelliklerini açıklar.",
    "Enlemin iklime ve yaşama etkilerini açıklar.",
    "Yerel saat ve ortak saat hesaplamalarını yapar.",
  ],
  "tyt-cografya.harita-bilgisi": [
    "Harita elemanlarını tanır.",
    "Ölçek hesaplamalarını yapar.",
    "Projeksiyon çeşitlerini açıklar.",
    "İzohips haritalarını yorumlar.",
  ],
  "tyt-cografya.iklim-bilgisi": [
    "Atmosferin katmanlarını ve özelliklerini açıklar.",
    "Sıcaklık, basınç, rüzgâr, nem ve yağışı etkileyen faktörleri açıklar.",
    "Büyük iklim tiplerini ayırt eder.",
    "Türkiye'nin iklim özelliklerini açıklar.",
  ],
  "tyt-cografya.yer-in-yapisi-ve-ic-kuvvetler": [
    "Yer'in katmanlarını açıklar.",
    "Levha tektoniğini açıklar.",
    "Deprem, volkanizma, orojenez ve epirojenezi açıklar.",
  ],
  "tyt-cografya.dis-kuvvetler": [
    "Akarsu, rüzgâr ve buzulların oluşturduğu şekilleri açıklar.",
    "Dalga ve akıntıların oluşturduğu şekilleri ve kıyı tiplerini açıklar.",
    "Karstik şekilleri açıklar.",
  ],
  "tyt-cografya.dogadaki-uc-unsur": [
    "Okyanus, deniz, göl ve akarsuların özelliklerini açıklar.",
    "Toprak oluşumunu ve toprak tiplerini açıklar.",
    "Bitki örtüsü tiplerini ve dağılışını açıklar.",
  ],
  "tyt-cografya.nufus-ve-yerlesme": [
    "Nüfusun dağılışını etkileyen faktörleri açıklar.",
    "Nüfus piramitlerini yorumlar.",
    "Kır ve kent yerleşmelerini ayırt eder.",
  ],
  "tyt-cografya.gocler": [
    "Göçün nedenlerini ve sonuçlarını açıklar.",
    "İç ve dış göçleri ayırt eder.",
  ],
  "tyt-cografya.ekonomik-faaliyetler": [
    "Ekonomik faaliyetleri birincil, ikincil, üçüncül, dördüncül ve beşincil olarak sınıflandırır.",
    "Ekonomik faaliyetlerin dağılışını etkileyen faktörleri açıklar.",
  ],
  "tyt-cografya.bolgeler-ve-ulkeler": [
    "Bölge kavramını ve türlerini açıklar.",
    "Ulaşım ağlarının önemini açıklar.",
  ],
  "tyt-cografya.dogal-afetler": [
    "Deprem, tsunami ve heyelanın nedenlerini ve etkilerini açıklar.",
    "Çığ, sel, taşkın ve erozyonu açıklar.",
    "Kuraklık ve orman yangınlarını açıklar, afetlerden korunma yollarını belirler.",
  ],

  /* ---------------- AYT Coğrafya ---------------- */
  "ayt-cografya.dogal-sistemler-biyocesitlilik-ve-ekosistem": [
    "Biyoçeşitliliği ve biyomları açıklar.",
    "Ekosistemin unsurlarını ve enerji akışını açıklar.",
    "Karbon, su ve azot döngülerini açıklar.",
    "Su ekosistemlerini açıklar.",
  ],
  "ayt-cografya.ekstrem-doga-olaylari-ve-iklim-degisimi": [
    "Ekstrem doğa olaylarını açıklar.",
    "Küresel iklim değişiminin nedenlerini ve sonuçlarını açıklar.",
  ],
  "ayt-cografya.beseri-sistemler-nufus-goc-ve-yerlesme": [
    "Ülkelerin nüfus politikalarını karşılaştırır.",
    "Şehirlerin fonksiyonlarını ve etki alanlarını açıklar.",
    "Türkiye'de şehirleşmeyi ve göçün mekânsal etkilerini açıklar.",
  ],
  "ayt-cografya.beseri-sistemler-ekonomik-faaliyetler-ve-turkiye-ekonomisi": [
    "Doğal kaynaklar ile ekonomi arasındaki ilişkiyi açıklar.",
    "Türkiye'de tarım, hayvancılık ve ormancılığı açıklar.",
    "Türkiye'nin maden ve enerji kaynaklarını açıklar.",
    "Türkiye'de sanayinin dağılışını açıklar.",
  ],
  "ayt-cografya.mekansal-bir-sentez-turkiye": [
    "Türkiye'nin kültürel mirasını ve turizm potansiyelini açıklar.",
    "Türkiye'de ulaşım sistemlerini ve ticareti açıklar.",
    "GAP, KOP, DOKAP gibi bölgesel kalkınma projelerini açıklar.",
  ],
  "ayt-cografya.kuresel-ortam-bolgeler-ve-ulkeler": [
    "İlk kültür merkezlerini açıklar.",
    "Küresel ticareti ve ham madde ilişkisini açıklar.",
    "Ülkeler arası etkileşimi açıklar.",
    "BM, NATO, AB ve OPEC gibi uluslararası örgütleri açıklar.",
  ],
  "ayt-cografya.cevre-ve-toplum": [
    "Doğal kaynakların bilinçsiz kullanımının sonuçlarını açıklar.",
    "Çevre sorunlarını ve çevre politikalarını açıklar.",
    "Geri dönüşümü ve afet yönetimini açıklar.",
  ],
};

/** Alt başlıkları (curriculum `sub`) listeye çevirir. "A, B (x, y), C / D" → ["A", "B (x, y)", "C", "D"] */
export function splitSub(sub: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of sub.replace(/\s\/\s/g, ", ")) {
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

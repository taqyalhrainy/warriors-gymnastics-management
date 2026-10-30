import { useNavigate } from 'react-router-dom';
import warriorsLogo from '../assets/warriors-logo.png';
import { useLanguage } from '../context/LanguageContext.jsx';

const policy = {
  en: {
    title: 'Privacy Policy',
    subtitle: 'Warriors Gymnastics parent website and application',
    updated: 'Last updated: 30 October 2026',
    back: 'Back',
    reviewTitle: 'Privacy and account-deletion requests',
    reviewText: 'Contact us by email. We may ask for information needed to verify the requester’s identity and relationship to the account or child.',
    contactEmail: 'warriorsgymnastics99@gmail.com',
    sections: [
      {
        title: '1. Scope and account access',
        paragraphs: [
          'This policy describes how the Warriors Gymnastics parent website and Android application handle information relating to parents and their children.',
          'The service is operated in the Hashemite Kingdom of Jordan under the registered trade name المحاربين الشجعان لتعليم الجمباز and uses Warriors Gymnastics as the application name.',
          'Parent accounts are created and managed by authorized club staff. The current parent application does not provide public self-registration.'
        ]
      },
      {
        title: '2. Information handled by the service',
        bullets: [
          'Parent account information, such as name, login identifier, email address or phone number, account status, and a securely hashed password.',
          'Child information, such as name, date of birth, group, coach, program, skill level, profile image, subscription dates, package details, notes, freeze information, and makeup classes.',
          'Attendance information, including attendance status, date, and check-in time.',
          'Subscription and payment records, including package value, paid and remaining amounts, payment type and method, receipt image when supplied, and related notes. The reviewed application does not collect payment-card credentials.',
          'Messages and notifications, including title, message, recipient, delivery/read status, and relevant timestamps.',
          'Technical and security information, including push-subscription or Firebase Cloud Messaging tokens, device/app version information, session information, IP address, user agent, and audit records of authorized administrative changes.',
          'Language, theme, notification preferences, and limited cached application data stored on the user’s device.'
        ]
      },
      {
        title: '3. Why information is used',
        bullets: [
          'To authenticate parents and protect account access.',
          'To display children, subscriptions, attendance, payments, amounts due, and club messages.',
          'To send requested service notifications through Android, iPhone/PWA, or supported browsers.',
          'To operate, secure, troubleshoot, and audit the service and authorized staff actions.',
          'To maintain club records and provide the services requested by the family.'
        ]
      },
      {
        title: '4. Children’s information',
        paragraphs: [
          'Children’s information is linked to a parent account and is used to manage gymnastics services. Parents should contact the club if a child’s information is incorrect or if access should be changed. The application is intended for parent or guardian use, not independent use by children.'
        ]
      },
      {
        title: '5. Notifications and Firebase',
        paragraphs: [
          'The Android application uses Firebase Cloud Messaging to deliver native notifications. The iPhone/PWA and supported browsers use Web Push. Device or browser push tokens and subscription details are stored so the service can route notifications to the correct signed-in devices.',
          'Notification permission may be disabled in the device or browser settings. Signing out or disabling notifications removes or unregisters supported push tokens where the platform permits.'
        ]
      },
      {
        title: '6. Storage and security',
        paragraphs: [
          'Application data is stored in the service’s MongoDB database and is accessed through the hosted backend. The code reviewed uses password hashing, role-based authorization, session invalidation, audit logging, HTTPS production endpoints, and encryption for selected sensitive database fields. No internet service can guarantee absolute security.'
        ]
      },
      {
        title: '7. Service providers and sharing',
        paragraphs: [
          'Information is shared only as needed to operate the service with infrastructure providers used by the application, including Render hosting, the MongoDB database service, Firebase Cloud Messaging, and browser/device push providers. These providers process information according to their own terms and privacy obligations.',
          'The backend is hosted by Render in Virginia (US East), United States, and the MongoDB Atlas database is hosted on AWS in Cape Town (af-south-1), South Africa. Personal information is therefore processed or stored outside Jordan. Firebase and browser or device push providers may also process information in locations determined by their services.',
          'These cross-border services are used to operate the application. This policy does not claim any specific transfer certification, contractual safeguard, or legal protection that has not been independently verified.',
          'The reviewed application does not include advertising SDKs, behavioural advertising, or a feature that sells personal information. Information may also be disclosed when required by Jordanian law or when reasonably necessary to protect users, the club, or the service.',
          'This policy is intended to operate in accordance with Jordan’s Personal Data Protection Law No. 24 of 2023 and the regulations and instructions issued under it.'
        ]
      },
      {
        title: '8. Retention',
        paragraphs: [
          'Attendance records and attendance-type notifications are automatically removed by the current system when they become older than one year.',
          'Parent account records do not currently have an automatic expiry. They remain stored while the account is in use and until they are reviewed or removed by the club following a verified request or an operational and legal review.',
          'Child profiles and subscription records are retained while needed to administer the child’s participation and to preserve the club’s operational history. Removing a child from active use currently marks the profile as deleted or left and preserves historical information rather than physically erasing every related record.',
          'Payment records, amounts, and receipt images are retained as operational and financial records for as long as reasonably needed for accounting, dispute handling, and applicable legal requirements. The system does not currently apply a fixed automatic deletion period to them.',
          'General notifications, change history, and security or audit logs are retained as reasonably needed for communication, integrity, security, and accountability. No fixed automatic deletion period was found for these records. The club should adopt and periodically review an internal retention schedule for these categories.'
        ]
      },
      {
        title: '9. Access, correction, and deletion requests',
        paragraphs: [
          'Parents may request access to, correction of, or deletion of their information and their children’s information by emailing warriorsgymnastics99@gmail.com. The request should identify the parent account, the child where applicable, and the requested action, but must not include a password or recovery secret.',
          'The club may request reasonable information to verify identity, authority, and the relationship to the child before acting on a request. The requester will be informed about the action taken or any information that must be retained.',
          'The current application does not provide self-service account deletion. An administrator can remove a parent login and parent record only after active child profiles have been addressed, and that action does not automatically erase all related records. Child deletion currently deactivates or soft-deletes the profile and retains its history.',
          'A deletion request therefore does not automatically erase every payment, subscription, history, notification, or audit record. Information that remains operationally required, is needed to protect the service or resolve a dispute, or must be retained under applicable Jordanian law may be restricted or retained instead of deleted.'
        ]
      },
      {
        title: '10. Contact and policy changes',
        paragraphs: [
          'Registered trade name: المحاربين الشجعان لتعليم الجمباز. Application name: Warriors Gymnastics.',
          'Country: The Hashemite Kingdom of Jordan.',
          'Privacy and account-deletion email: warriorsgymnastics99@gmail.com.',
          'This policy may be updated when the service or its legal requirements change. The date above will be updated when a revised policy is published.'
        ]
      }
    ]
  },
  ar: {
    title: 'سياسة الخصوصية',
    subtitle: 'موقع وتطبيق الأهالي الخاص بـ Warriors Gymnastics',
    updated: 'آخر تحديث: 30 أكتوبر 2026',
    back: 'رجوع',
    reviewTitle: 'طلبات الخصوصية وحذف الحساب',
    reviewText: 'تواصل معنا عبر البريد الإلكتروني. قد نطلب معلومات لازمة للتحقق من هوية مقدم الطلب وعلاقته بالحساب أو الطفل.',
    contactEmail: 'warriorsgymnastics99@gmail.com',
    sections: [
      {
        title: '1. نطاق السياسة والوصول إلى الحساب',
        paragraphs: [
          'توضح هذه السياسة كيفية تعامل موقع وتطبيق Warriors Gymnastics للأهالي مع المعلومات المتعلقة بأولياء الأمور وأطفالهم.',
          'تُشغّل الخدمة في المملكة الأردنية الهاشمية تحت الاسم التجاري المسجل «المحاربين الشجعان لتعليم الجمباز»، ويُستخدم اسم Warriors Gymnastics للتطبيق.',
          'ينشئ موظفو النادي المخولون حسابات الأهالي ويديرونها. لا يوفر تطبيق الأهالي الحالي تسجيلًا عامًا لإنشاء الحساب ذاتيًا.'
        ]
      },
      {
        title: '2. المعلومات التي تتعامل معها الخدمة',
        bullets: [
          'بيانات حساب ولي الأمر، مثل الاسم ومعرّف تسجيل الدخول والبريد الإلكتروني أو رقم الهاتف وحالة الحساب. تُحفظ كلمة المرور بصيغة تجزئة آمنة ولا تُخزن كنص صريح.',
          'بيانات الطفل، مثل الاسم وتاريخ الميلاد والمجموعة والمدرب والبرنامج والمستوى وصورة الملف ومواعيد الاشتراك وتفاصيل الباقة والملاحظات والتجميد والحصص التعويضية.',
          'بيانات الحضور، بما فيها حالة الحضور والتاريخ ووقت تسجيل الدخول.',
          'سجلات الاشتراك والدفع، بما فيها قيمة الباقة والمبلغ المدفوع والمتبقي ونوع وطريقة الدفع وصورة الإيصال عند إضافتها والملاحظات المرتبطة. التطبيق الذي تمت مراجعته لا يجمع بيانات بطاقات الدفع.',
          'الرسائل والإشعارات، بما فيها العنوان والنص والمستلم وحالة التسليم أو القراءة والتواريخ ذات الصلة.',
          'بيانات تقنية وأمنية، مثل اشتراك الإشعارات أو رمز Firebase Cloud Messaging وبيانات الجهاز وإصدار التطبيق والجلسة وعنوان IP ومتصفح أو نظام المستخدم وسجلات تدقيق تعديلات الموظفين المخولين.',
          'اللغة والمظهر وتفضيلات الإشعارات وبيانات مؤقتة محدودة يحفظها التطبيق على جهاز المستخدم.'
        ]
      },
      {
        title: '3. أغراض استخدام المعلومات',
        bullets: [
          'التحقق من هوية ولي الأمر وحماية الوصول إلى الحساب.',
          'عرض الأطفال والاشتراكات والحضور والدفعات والمبالغ المستحقة ورسائل النادي.',
          'إرسال إشعارات الخدمة المطلوبة عبر Android أو iPhone/PWA أو المتصفحات المدعومة.',
          'تشغيل الخدمة وحمايتها وتشخيص مشاكلها وتدقيق أعمال الموظفين المخولين.',
          'حفظ سجلات النادي وتقديم الخدمات التي تطلبها العائلة.'
        ]
      },
      {
        title: '4. بيانات الأطفال',
        paragraphs: [
          'ترتبط بيانات الأطفال بحساب ولي الأمر وتُستخدم لإدارة خدمات الجمباز. يجب على ولي الأمر التواصل مع النادي إذا كانت بيانات الطفل غير صحيحة أو إذا كان يجب تغيير صلاحية الوصول. التطبيق مخصص لاستخدام ولي الأمر أو الوصي وليس للاستخدام المستقل من الطفل.'
        ]
      },
      {
        title: '5. الإشعارات وFirebase',
        paragraphs: [
          'يستخدم تطبيق Android خدمة Firebase Cloud Messaging لإرسال الإشعارات الأصلية، بينما يستخدم iPhone/PWA والمتصفحات المدعومة Web Push. تُحفظ رموز الجهاز أو اشتراكات المتصفح حتى تتمكن الخدمة من توجيه الإشعارات إلى الأجهزة الصحيحة المسجل دخولها.',
          'يمكن تعطيل إذن الإشعارات من إعدادات الجهاز أو المتصفح. وعند تسجيل الخروج أو تعطيل الإشعارات، يزيل النظام رموز الإشعارات المدعومة أو يلغي تسجيلها حيث تسمح المنصة بذلك.'
        ]
      },
      {
        title: '6. تخزين المعلومات وحمايتها',
        paragraphs: [
          'تُخزن بيانات التطبيق في قاعدة بيانات MongoDB الخاصة بالخدمة ويجري الوصول إليها عبر الخادم المستضاف. يستخدم النظام الذي تمت مراجعته تجزئة كلمات المرور والصلاحيات حسب الدور وإبطال الجلسات وسجلات التدقيق واتصالات HTTPS للإنتاج وتشفير حقول حساسة محددة في قاعدة البيانات. لا يمكن لأي خدمة عبر الإنترنت ضمان حماية مطلقة.'
        ]
      },
      {
        title: '7. مزودو الخدمة ومشاركة البيانات',
        paragraphs: [
          'تُشارك المعلومات بالقدر اللازم لتشغيل الخدمة مع مزودي البنية التحتية الذين يستخدمهم التطبيق، ومنهم استضافة Render وخدمة قاعدة بيانات MongoDB وخدمة Firebase Cloud Messaging ومزودو إشعارات الأجهزة والمتصفحات. يعالج هؤلاء المزودون المعلومات وفق شروطهم والتزاماتهم المتعلقة بالخصوصية.',
          'تتم استضافة الخادم الخلفي لدى Render في فرجينيا (شرق الولايات المتحدة)، الولايات المتحدة الأمريكية، وتتم استضافة قاعدة بيانات MongoDB Atlas على AWS في كيب تاون (af-south-1)، جنوب أفريقيا. لذلك تُعالج البيانات الشخصية أو تُخزن خارج الأردن. وقد يعالج Firebase ومزودو إشعارات الأجهزة أو المتصفحات البيانات أيضًا في مواقع تحددها خدماتهم.',
          'تُستخدم هذه الخدمات العابرة للحدود لتشغيل التطبيق. ولا تدّعي هذه السياسة وجود شهادة نقل محددة أو ضمانات تعاقدية أو حماية قانونية لم يتم التحقق منها بصورة مستقلة.',
          'لا يتضمن التطبيق الذي تمت مراجعته حزم إعلانات أو إعلانات سلوكية أو ميزة لبيع البيانات الشخصية. وقد يُفصح عن المعلومات إذا تطلب القانون الأردني ذلك أو كان الإفصاح ضروريًا بصورة معقولة لحماية المستخدمين أو النادي أو الخدمة.',
          'تهدف هذه السياسة إلى العمل وفق قانون حماية البيانات الشخصية الأردني رقم (24) لسنة 2023 والأنظمة والتعليمات الصادرة بمقتضاه.'
        ]
      },
      {
        title: '8. مدة الاحتفاظ بالبيانات',
        paragraphs: [
          'يحذف النظام الحالي تلقائيًا سجلات الحضور والإشعارات من نوع الحضور عندما يصبح عمرها أكثر من سنة واحدة.',
          'لا توجد حاليًا مدة انتهاء تلقائية لبيانات حساب ولي الأمر. تبقى البيانات مخزنة أثناء استخدام الحساب وإلى أن يراجعها النادي أو يزيلها بعد طلب تم التحقق منه أو مراجعة تشغيلية وقانونية.',
          'تُحتفظ بملفات الأطفال وسجلات الاشتراكات ما دامت لازمة لإدارة مشاركة الطفل ولحفظ التاريخ التشغيلي للنادي. حذف الطفل من الاستخدام النشط حاليًا يعلّم الملف كمحذوف أو منسحب ويحفظ المعلومات التاريخية بدل الإزالة المادية لكل السجلات المرتبطة.',
          'تُحتفظ بسجلات الدفعات والمبالغ وصور الإيصالات كسجلات تشغيلية ومالية ما دامت مطلوبة بصورة معقولة للمحاسبة ومعالجة النزاعات والمتطلبات القانونية المطبقة. لا يطبق النظام حاليًا مدة حذف تلقائي ثابتة لها.',
          'تُحتفظ بالإشعارات العامة وسجل التغييرات وسجلات الأمن والتدقيق بالقدر المعقول اللازم للتواصل وسلامة البيانات والأمن والمساءلة. لم توجد مدة حذف تلقائي ثابتة لهذه الفئات، وينبغي للنادي اعتماد جدول احتفاظ داخلي لها ومراجعته دوريًا.'
        ]
      },
      {
        title: '9. طلبات الوصول والتصحيح والحذف',
        paragraphs: [
          'يستطيع ولي الأمر طلب الوصول إلى بياناته وبيانات أطفاله أو تصحيحها أو حذفها بإرسال بريد إلى warriorsgymnastics99@gmail.com. يجب أن يحدد الطلب حساب ولي الأمر والطفل عند الحاجة والإجراء المطلوب، وألا يتضمن كلمة المرور أو رمز الاسترداد.',
          'قد يطلب النادي معلومات معقولة للتحقق من الهوية والصلاحية والعلاقة بالطفل قبل تنفيذ الطلب، وسيُبلّغ مقدم الطلب بالإجراء المنفذ أو بالبيانات التي يلزم الاحتفاظ بها.',
          'لا يوفر التطبيق الحالي حذف الحساب ذاتيًا. يستطيع الأدمن حذف تسجيل دخول ولي الأمر وسجل ولي الأمر فقط بعد معالجة ملفات الأطفال النشطين، ولا يؤدي هذا الإجراء تلقائيًا إلى محو جميع السجلات المرتبطة. أما حذف الطفل حاليًا فيعطّل الملف أو يحذفه منطقيًا مع الاحتفاظ بتاريخه.',
          'لذلك لا يؤدي طلب الحذف تلقائيًا إلى محو كل سجل دفع أو اشتراك أو تاريخ أو إشعار أو تدقيق. قد تُقيّد البيانات أو يُحتفظ بها بدل حذفها إذا بقيت لازمة تشغيليًا أو لحماية الخدمة أو حل نزاع أو للالتزام بالقانون الأردني المطبق.'
        ]
      },
      {
        title: '10. التواصل وتحديث السياسة',
        paragraphs: [
          'الاسم التجاري المسجل: المحاربين الشجعان لتعليم الجمباز. اسم التطبيق: Warriors Gymnastics.',
          'الدولة: المملكة الأردنية الهاشمية.',
          'البريد المعتمد للخصوصية وحذف الحساب: warriorsgymnastics99@gmail.com.',
          'قد تُحدّث هذه السياسة عند تغيير الخدمة أو متطلباتها القانونية، وسيُحدّث التاريخ أعلاه عند نشر نسخة معدلة.'
        ]
      }
    ]
  }
};

const PrivacyPolicyPage = () => {
  const navigate = useNavigate();
  const { language, changeLanguage } = useLanguage();
  const content = policy[language === 'ar' ? 'ar' : 'en'];

  return (
    <main className="privacy-policy-page" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      <header className="privacy-policy-header">
        <button type="button" className="privacy-policy-brand" onClick={() => navigate('/')}>
          <img src={warriorsLogo} alt="Warriors Gymnastics" />
          <span>Warriors Gymnastics</span>
        </button>
        <div className="privacy-language-switch" aria-label="Policy language">
          <button type="button" className={language === 'en' ? 'is-active' : ''} onClick={() => changeLanguage('en')}>EN</button>
          <button type="button" className={language === 'ar' ? 'is-active' : ''} onClick={() => changeLanguage('ar')}>AR</button>
        </div>
      </header>

      <article className="privacy-policy-document">
        <div className="privacy-policy-title">
          <span>{content.subtitle}</span>
          <h1>{content.title}</h1>
          <p>{content.updated}</p>
        </div>

        <aside className="privacy-review-notice" role="note">
          <strong>{content.reviewTitle}</strong>
          <p>{content.reviewText}</p>
          <a href={`mailto:${content.contactEmail}`}>{content.contactEmail}</a>
        </aside>

        {content.sections.map((section) => (
          <section className="privacy-policy-section" key={section.title}>
            <h2>{section.title}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {section.bullets && (
              <ul>
                {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
              </ul>
            )}
          </section>
        ))}

        <button type="button" className="privacy-policy-back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          {content.back}
        </button>
      </article>
    </main>
  );
};

export default PrivacyPolicyPage;

import type { AddressBlockBody, PersonBlockBody, Student, StudentWriteBody } from "@/lib/students/studentTypes";
import type { StudentFormData, PersonBlockForm, AddressBlockForm } from "@/components/students/wizard/studentFormTypes";
import { EMPTY_ADDRESS_BLOCK, EMPTY_PERSON_BLOCK } from "@/components/students/wizard/studentFormTypes";
import type { AttachedFile } from "@/lib/files/filesApi";

/**
 * Wire (Student) -> UI form shape, for seeding the wizard in edit mode.
 * `studentLastName` seeds `lastNameTouched` the same way SubjectsMasterScreen
 * seeds `shortNameTouched`: if this block's saved last name already equals
 * the student's, treat it as untouched (so future edits to the student's
 * Last Name keep auto-syncing it); if it's already different (e.g. a
 * guardian's own surname), treat it as touched so re-opening the wizard
 * never silently overwrites an intentional override.
 */
function toPersonBlockForm(block: Student["father"], studentLastName: string): PersonBlockForm {
  if (!block) return { ...EMPTY_PERSON_BLOCK };
  return {
    first_name: block.first_name,
    middle_name: block.middle_name ?? "",
    last_name: block.last_name,
    phone: block.phone,
    email: block.email ?? "",
    occupation: block.occupation ?? "",
    lastNameTouched: block.last_name !== "" && block.last_name !== studentLastName,
  };
}

function toAddressBlockForm(block: Student["home_address"] | null): AddressBlockForm {
  if (!block) return { ...EMPTY_ADDRESS_BLOCK };
  return {
    street: block.street,
    country_code: block.country_code ?? "",
    state_code: block.state_code ?? "",
    city: block.city ?? "",
    postal_code: block.postal_code ?? "",
    lga_or_area: block.lga_or_area ?? "",
  };
}

/** The student response only carries the file id — name/size/type are display-only and stay null (same as filesApi.readAttachedFile's flat-id case). */
function attachedFromId(fileId: string | null): AttachedFile | null {
  return fileId ? { file_id: fileId, name: null, size: null, type: null } : null;
}

export function studentToFormData(student: Student): StudentFormData {
  return {
    classDetails: {
      school_type_id: student.school_type_id,
      class_id: student.class_id,
      class_arm_id: student.class_arm_id,
      class_term_id: student.class_term_id ?? "",
      academic_house_id: student.academic_house_id ?? "",
      boarding_house_id: student.boarding_house_id ?? "",
      mode: student.mode,
      extra_curricular_ids: student.extra_curricular_ids,
    },
    studentDetails: {
      // Seeded from the stored file id so a re-save keeps it — every save
      // sends the full document, so leaving this null would CLEAR the photo.
      photo: attachedFromId(student.photo_file_id),
      first_name: student.first_name,
      other_names: student.other_names ?? "",
      last_name: student.last_name,
      admission_number: student.admission_number ?? "",
      email: student.email ?? "",
      gender: student.gender,
      religion: student.religion_is_other ? "other" : (student.religion ?? ""),
      religion_is_other: student.religion_is_other,
      religion_other_text: student.religion_is_other ? (student.religion ?? "") : "",
      nationality: student.nationality,
      date_of_birth: student.date_of_birth,
      height: student.height ?? "",
      weight: student.weight ?? "",
      blood_group: student.blood_group ?? "",
      genotype: student.genotype ?? "",
      allergies: student.allergies ?? "",
      medical_conditions: student.medical_conditions ?? "",
      medications: student.medications ?? "",
      special_needs_notes: student.special_needs_notes ?? "",
    },
    parentGuardian: {
      relationship_type: student.relationship_type,
      father: toPersonBlockForm(student.father, student.last_name),
      mother: toPersonBlockForm(student.mother, student.last_name),
      guardian: toPersonBlockForm(student.guardian, student.last_name),
      primary_contact: student.primary_contact ?? "",
    },
    address: {
      home: toAddressBlockForm(student.home_address),
      other_same_as_home: student.other_address_same_as_home,
      other: toAddressBlockForm(student.other_address),
      emergency_contacts: [
        {
          name: student.emergency_contacts[0]?.name ?? "",
          phone: student.emergency_contacts[0]?.phone ?? "",
        },
        {
          name: student.emergency_contacts[1]?.name ?? "",
          phone: student.emergency_contacts[1]?.phone ?? "",
        },
      ],
    },
    agent: {
      agent_id: student.agent_id ?? "",
      has_agent_commission: student.has_agent_commission,
    },
    siblings: {
      sibling_student_ids: student.sibling_student_ids,
    },
    pastRecords: {
      records: student.past_records.map((record) => ({
        localId: record.id,
        school: record.school ?? "",
        class: record.class ?? "",
        grade: record.grade ?? "",
        rank: record.rank ?? "",
        year: record.year ?? "",
        attachment: attachedFromId(record.attachment_file_id),
      })),
    },
    loginDetails: {
      username: student.username,
      // Same seeding rule as lastNameTouched above: a username that already
      // equals the lowercased email is still "following" it; anything else
      // is an intentional choice that later email edits mustn't overwrite.
      usernameTouched: student.username !== "" && student.username !== (student.email ?? "").toLowerCase(),
      two_factor_enabled: student.two_factor_enabled,
      login_activated: student.login_activated,
    },
  };
}

function orNull(value: string): string | null {
  return value.trim() ? value : null;
}

function isBlank(values: string[]): boolean {
  return values.every((value) => !value.trim());
}

/** A block nobody has typed into yet goes out as null rather than an object of nulls — a draft's untouched Father block isn't "a father with no name". */
function toPersonBlock(form: PersonBlockForm): PersonBlockBody | null {
  if (isBlank([form.first_name, form.middle_name, form.last_name, form.phone, form.email, form.occupation])) return null;
  return {
    first_name: orNull(form.first_name),
    middle_name: orNull(form.middle_name),
    last_name: orNull(form.last_name),
    phone: orNull(form.phone),
    email: orNull(form.email),
    occupation: orNull(form.occupation),
  };
}

function toAddressBlock(form: AddressBlockForm): AddressBlockBody | null {
  if (isBlank([form.street, form.country_code, form.state_code, form.city, form.postal_code, form.lga_or_area])) return null;
  return {
    street: orNull(form.street),
    country_code: orNull(form.country_code),
    state_code: orNull(form.state_code),
    city: orNull(form.city),
    postal_code: orNull(form.postal_code),
    lga_or_area: orNull(form.lga_or_area),
  };
}

/**
 * UI form -> wire body (StudentWriteBody) for every draft save, submit,
 * create and update — always the complete form, with null for anything
 * not filled yet (a draft legitimately has required fields empty; final
 * saves are gated by validateAllSteps() before they get here).
 *
 * `academicYearId` is sent on every save, drafts included: the list is
 * year-filtered and a student without one never shows up in it (the
 * wizard refuses to save without a year).
 *
 * NEVER sent (UI-only, the backend 422s on them unless null/omitted — see
 * studentTypes.ts): academic_house_id, boarding_house_id, agent_id,
 * extra_curricular_ids, fee_display. Nor is any password — the backend
 * assigns the initial one. `username` is omitted when blank: a final save
 * then defaults it to the lowercased email, an update keeps the existing.
 */
export function formDataToStudentBody(data: StudentFormData, academicYearId: string): StudentWriteBody {
  const { classDetails, studentDetails, parentGuardian, address, agent, siblings, pastRecords, loginDetails } = data;

  const isGuardian = parentGuardian.relationship_type === "guardian";
  const religion = studentDetails.religion_is_other ? studentDetails.religion_other_text : studentDetails.religion;
  const username = loginDetails.username.trim();

  const emergencyContacts = address.emergency_contacts
    .filter((contact) => contact.name.trim() || contact.phone.trim())
    .map((contact) => ({ name: orNull(contact.name), phone: orNull(contact.phone) }));

  return {
    mode: classDetails.mode || null,
    first_name: orNull(studentDetails.first_name),
    other_names: orNull(studentDetails.other_names),
    last_name: orNull(studentDetails.last_name),
    gender: studentDetails.gender || null,
    religion: orNull(religion),
    religion_is_other: studentDetails.religion_is_other,
    nationality: orNull(studentDetails.nationality),
    date_of_birth: orNull(studentDetails.date_of_birth),
    height: orNull(studentDetails.height),
    weight: orNull(studentDetails.weight),
    blood_group: orNull(studentDetails.blood_group),
    genotype: orNull(studentDetails.genotype),
    allergies: orNull(studentDetails.allergies),
    medical_conditions: orNull(studentDetails.medical_conditions),
    medications: orNull(studentDetails.medications),
    special_needs_notes: orNull(studentDetails.special_needs_notes),
    photo_file_id: studentDetails.photo?.file_id ?? null,
    admission_number: orNull(studentDetails.admission_number),

    email: orNull(studentDetails.email),
    ...(username ? { username } : {}),
    login_activated: loginDetails.login_activated,
    two_factor_enabled: loginDetails.two_factor_enabled,

    relationship_type: parentGuardian.relationship_type,
    father: isGuardian ? null : toPersonBlock(parentGuardian.father),
    mother: isGuardian ? null : toPersonBlock(parentGuardian.mother),
    guardian: isGuardian ? toPersonBlock(parentGuardian.guardian) : null,
    primary_contact: parentGuardian.primary_contact || null,

    home_address: toAddressBlock(address.home),
    other_address_same_as_home: address.other_same_as_home,
    other_address: address.other_same_as_home ? null : toAddressBlock(address.other),

    emergency_contacts: emergencyContacts,
    sibling_student_ids: siblings.sibling_student_ids,
    past_records: pastRecords.records.map((record) => ({
      school: orNull(record.school),
      class: orNull(record.class),
      grade: orNull(record.grade),
      rank: orNull(record.rank),
      year: orNull(record.year),
      attachment_file_id: record.attachment?.file_id ?? null,
    })),

    academic_year_id: academicYearId,
    school_type_id: orNull(classDetails.school_type_id),
    class_id: orNull(classDetails.class_id),
    class_arm_id: orNull(classDetails.class_arm_id),
    class_term_id: orNull(classDetails.class_term_id),

    has_agent_commission: agent.has_agent_commission,
  };
}

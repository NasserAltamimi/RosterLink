export const applicationStates = {
  submitted: 'Submitted', reviewing: 'In review', shortlisted: 'Shortlisted',
  accepted: 'Accepted', rejected: 'Rejected', withdrawn: 'Withdrawn',
};

export const activeApplicationStates = ['submitted', 'reviewing', 'shortlisted'];

export const applicationActions = {
  review: 'Mark in review', shortlist: 'Shortlist', accept: 'Accept application',
  reject: 'Reject application', withdraw: 'Withdraw application', invite: 'Send tryout invitation',
  attend: 'Accept invitation', decline: 'Decline invitation',
};

export const applicationUpdates = {
  submitted: 'New application', reviewing: 'Application is in review', shortlisted: 'Application shortlisted',
  accepted: 'Application accepted', rejected: 'Application rejected', withdrawn: 'Application withdrawn',
  invited: 'New tryout invitation', attending: 'Tryout invitation accepted', declined: 'Tryout invitation declined',
};
